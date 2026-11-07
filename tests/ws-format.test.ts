import { describe, expect, it } from "vitest";
import { budgetTotals } from "@/lib/ws/budget";
import { countdownLabel, coupleName, daysUntil, parseMoney, todayIso } from "@/lib/ws/format";

describe("countdown", () => {
  it("telt hele dagen in Nederlandse tijd", () => {
    expect(daysUntil("2027-06-22", "2026-11-05")).toBe(229);
    expect(countdownLabel("2026-11-06", "2026-11-05")).toBe("Morgen");
    expect(countdownLabel("2026-11-05", "2026-11-05")).toBe("Vandaag");
    expect(countdownLabel("2026-11-04", "2026-11-05")).toBeNull();
    expect(countdownLabel(null)).toBeNull();
  });
  it("gebruikt de Nederlandse datum, ook vlak na middernacht", () => {
    // 23:30 UTC on 5 November is already 6 November in Amsterdam (UTC+1).
    expect(todayIso(new Date("2026-11-05T23:30:00Z"))).toBe("2026-11-06");
  });
});

describe("bedragen", () => {
  it("leest Nederlandse en gewone notatie", () => {
    expect(parseMoney("1.250,50")).toBe(125050);
    expect(parseMoney("€ 2400")).toBe(240000);
    expect(parseMoney("595,-".replace(",-", ""))).toBe(59500);
    expect(parseMoney("99.5")).toBe(9950);
    expect(parseMoney("")).toBeNull();
    expect(() => parseMoney("twintig")).toThrow();
    expect(() => parseMoney("-5")).toThrow();
  });
  it("rekent totalen en wat nog betaald moet worden", () => {
    const t = budgetTotals([
      { budget_cents: 240000, actual_cents: 240000, deposit_cents: null, paid: true },
      { budget_cents: 320000, actual_cents: null, deposit_cents: 50000, paid: false },
    ]);
    expect(t).toEqual({ budget: 560000, actual: 240000, paid: 290000, outstanding: 270000 });
  });
});

describe("namen", () => {
  it("toont beide voornamen, of één als de tweede leeg is", () => {
    expect(coupleName({ partner1_first: "Carlijn", partner2_first: "Thom" })).toBe("Carlijn & Thom");
    expect(coupleName({ partner1_first: "Carlijn", partner2_first: " " })).toBe("Carlijn");
  });
});

import { parseMoney as parse } from "@/lib/ws/format";

describe("bedragen met duizendtallen", () => {
  it("reads 25.000 as twenty-five thousand", () => {
    expect(parse("25.000")).toBe(2_500_000);
    expect(parse("€ 1.250.000")).toBe(125_000_000);
    expect(parse("12.50")).toBe(1250);
    expect(parse("1.234,56")).toBe(123_456);
  });
});
