import { describe, expect, it } from "vitest";
import { installments, paymentState, periodRange, revenueSummary } from "@/lib/ws/payments";

describe("prijs en betaling per bruidspaar", () => {
  it("splitst in twee helften, een losse cent gaat naar de tweede", () => {
    expect(installments(250000, "two")).toEqual([125000, 125000]);
    expect(installments(100001, "two")).toEqual([50000, 50001]);
    expect(installments(99900, "once")).toEqual([99900]);
  });

  it("rekent uit wat nog openstaat", () => {
    const base = { agreed_price_cents: 300000, paid_first_at: null, paid_second_at: null };
    expect(paymentState({ ...base, payment_plan: "once" }).open).toBe(300000);
    expect(paymentState({ ...base, payment_plan: "once", paid_first_at: new Date() }).status).toBe("betaald");
    const half = paymentState({ ...base, payment_plan: "two", paid_first_at: new Date() });
    expect(half).toMatchObject({ paid: 150000, open: 150000, status: "deels" });
    // A second-half tick on a one-time payment does not count.
    expect(paymentState({ ...base, payment_plan: "once", paid_second_at: new Date() }).open).toBe(300000);
    expect(paymentState({ ...base, agreed_price_cents: null, payment_plan: "once" })).toMatchObject({ open: 0, status: "geen_prijs" });
  });

  it("kent de kwartalen en het jaar", () => {
    expect(periodRange(2026, "jaar")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(periodRange(2026, "q1")).toEqual({ from: "2026-01-01", to: "2026-03-31" });
    expect(periodRange(2028, "q1").to).toBe("2028-03-31");
    expect(periodRange(2026, "q2")).toEqual({ from: "2026-04-01", to: "2026-06-30" });
    expect(periodRange(2026, "q4")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
  });

  it("telt omzet, pakketten en betaalwijze in de periode", () => {
    const couples = [
      { sold_on: "2026-02-10", packages: 2, agreed_price_cents: 300000, payment_plan: "two" as const, paid_first_at: "x", paid_second_at: null },
      { sold_on: "2026-03-31", packages: 1, agreed_price_cents: 100000, payment_plan: "once" as const, paid_first_at: null, paid_second_at: null },
      { sold_on: "2026-04-01", packages: 1, agreed_price_cents: 50000, payment_plan: "once" as const, paid_first_at: null, paid_second_at: null },
      { sold_on: "2026-01-05", packages: 1, agreed_price_cents: null, payment_plan: "once" as const, paid_first_at: null, paid_second_at: null },
    ];
    expect(revenueSummary(couples, periodRange(2026, "q1"))).toEqual({
      couples: 3, packages: 4, revenue: 400000, paid: 150000, open: 250000, once: 2, two: 1, withoutPrice: 1,
    });
    expect(revenueSummary(couples, periodRange(2026, "q2")).revenue).toBe(50000);
  });
});
