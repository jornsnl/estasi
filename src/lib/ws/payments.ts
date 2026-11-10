// Price and payment per couple (feedback Sabine): the agreed price, paid at once or in two
// halves, what is still open, and the revenue per year or quarter (Pipeline, Omzet).
// Pure, so it is unit tested (tests/ws-payments.test.ts).

export type PaymentPlan = "once" | "two";

export const PAYMENT_PLAN_LABELS: Record<PaymentPlan, string> = {
  once: "In één keer",
  two: "In twee keer (helft-helft)",
};

export interface PaymentFields {
  agreed_price_cents: number | null;
  payment_plan: PaymentPlan;
  paid_first_at: Date | string | null;
  paid_second_at: Date | string | null;
}

/** The parts of the price: one, or two halves (an odd cent goes to the second half). */
export function installments(price: number, plan: PaymentPlan): number[] {
  if (plan === "once") return [price];
  const first = Math.floor(price / 2);
  return [first, price - first];
}

/** What has been paid and what is still open. Without a price nothing is open. */
export function paymentState(c: PaymentFields) {
  const price = c.agreed_price_cents ?? 0;
  const parts = installments(price, c.payment_plan);
  const paidFlags = c.payment_plan === "once" ? [Boolean(c.paid_first_at)] : [Boolean(c.paid_first_at), Boolean(c.paid_second_at)];
  const paid = parts.reduce((sum, part, i) => sum + (paidFlags[i] ? part : 0), 0);
  const open = price - paid;
  const status: "geen_prijs" | "betaald" | "deels" | "open" =
    c.agreed_price_cents === null ? "geen_prijs" : open === 0 ? "betaald" : paid > 0 ? "deels" : "open";
  return { price, parts, paidFlags, paid, open, status };
}

export const PAYMENT_STATUS_LABELS = {
  geen_prijs: "Geen prijs ingevuld",
  betaald: "Betaald",
  deels: "Deels betaald",
  open: "Nog niet betaald",
} as const;

export const PERIODS = ["jaar", "q1", "q2", "q3", "q4"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABELS: Record<Period, string> = { jaar: "Heel jaar", q1: "Q1", q2: "Q2", q3: "Q3", q4: "Q4" };

export const isPeriod = (value: unknown): value is Period => typeof value === "string" && (PERIODS as readonly string[]).includes(value);

/** First and last day (YYYY-MM-DD, both included) of a year or one of its quarters. */
export function periodRange(year: number, period: Period): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (period === "jaar") return { from: `${year}-01-01`, to: `${year}-12-31` };
  const q = Number(period.slice(1));
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  return { from: `${year}-${pad(startMonth)}-01`, to: `${year}-${pad(endMonth)}-${pad(lastDay)}` };
}

export interface SoldCouple extends PaymentFields {
  sold_on: string;
  packages: number;
}

/** Totals for the revenue overview, over the couples sold in the period. */
export function revenueSummary(couples: SoldCouple[], range: { from: string; to: string }) {
  const sold = couples.filter((c) => c.sold_on >= range.from && c.sold_on <= range.to);
  let revenue = 0;
  let paid = 0;
  let once = 0;
  let two = 0;
  let packages = 0;
  let withoutPrice = 0;
  for (const c of sold) {
    const state = paymentState(c);
    revenue += state.price;
    paid += state.paid;
    packages += c.packages;
    if (c.agreed_price_cents === null) withoutPrice += 1;
    if (c.payment_plan === "two") two += 1;
    else once += 1;
  }
  return { couples: sold.length, packages, revenue, paid, open: revenue - paid, once, two, withoutPrice };
}
