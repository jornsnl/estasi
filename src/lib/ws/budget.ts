import type { BudgetItem } from "@/lib/ws/types";

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
