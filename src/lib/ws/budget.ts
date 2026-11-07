import { costRemaining } from "./pure";
import type { BudgetItem } from "./types";

export interface BudgetTotals {
  budget: number;
  actual: number;
  paid: number;
  outstanding: number;
}

/**
 * "Werkelijk" falls back to the budget when no real amount is known yet.
 * Paid items count in full; otherwise only a deposit counts as paid.
 */
export function budgetTotals(items: Pick<BudgetItem, "budget_cents" | "actual_cents" | "deposit_cents" | "paid">[]): BudgetTotals {
  let budget = 0;
  let actual = 0;
  let paid = 0;
  for (const item of items) {
    const cost = item.actual_cents ?? item.budget_cents;
    budget += item.budget_cents;
    actual += item.actual_cents ?? 0;
    paid += item.paid ? cost : Math.min(item.deposit_cents ?? 0, cost);
  }
  const expected = items.reduce((n, i) => n + (i.actual_cents ?? i.budget_cents), 0);
  return { budget, actual, paid, outstanding: Math.max(0, expected - paid) };
}

/** Real costs per category, largest first (for the pie chart). */
export function costsByCategory(items: Pick<BudgetItem, "category" | "actual_cents">[]): { category: string; cents: number }[] {
  const map = new Map<string, number>();
  for (const i of items) if (i.actual_cents) map.set(i.category || "Overig", (map.get(i.category || "Overig") ?? 0) + i.actual_cents);
  return [...map.entries()].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents);
}

export { costRemaining };
