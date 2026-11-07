import Link from "next/link";
import { addExtraCost } from "@/app/actions/ws-costs";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { CostPie, CostTable } from "@/components/ws/CostTable";
import { requirePlanning } from "@/lib/ws/access";
import { budgetTotals, costsByCategory } from "@/lib/ws/budget";
import { costLines, ESTASI } from "@/lib/ws/costs";
import { one } from "@/lib/ws/db";
import { formatMoney, todayIso } from "@/lib/ws/format";
import { categoriesFor } from "@/lib/ws/suppliers";

export const metadata = { title: "Kostenoverzicht" };

export default async function BudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple, isAdmin } = await requirePlanning(coupleId);
  const [lines, categories, budgetAssignment] = await Promise.all([
    costLines(couple.id),
    categoriesFor(couple.id),
    one<{ id: string }>("select id from assignments where couple_id = $1 and budget order by position limit 1", [couple.id]),
  ]);
  const totals = budgetTotals(lines);
  const categoryNames = [...categories.map((c) => c.name), ESTASI];

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Onderdeel</p>
        <h1 className="mt-1 text-3xl">Kostenoverzicht</h1>
        <p className="mt-1 text-sm text-muted">
          Begroting, werkelijke kosten en wat er nog betaald moet worden. Bedragen inclusief btw.
          {budgetAssignment && <> De begroting vullen jullie in bij <Link href={`/k/${couple.id}/opdrachten/${budgetAssignment.id}`} className="text-bordeaux underline">Budgetplanning & prioriteiten</Link>.</>}
        </p>
      </header>
      <Notice searchParams={searchParams} />

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ["Begroot", totals.budget],
          ["Werkelijk", totals.actual],
          ["Al betaald", totals.paid],
          ["Nog te betalen", totals.outstanding],
        ].map(([label, value]) => (
          <div key={label as string} className="card p-4">
            <p className="text-sm text-muted">{label}</p>
            <p className="font-serif text-2xl font-semibold">{formatMoney(value as number)}</p>
          </div>
        ))}
      </section>

      <CostTable
        coupleId={couple.id}
        isAdmin={isAdmin}
        today={todayIso()}
        categories={categoryNames}
        rows={lines.map((l) => ({
          id: l.id, kind: l.kind, name: l.name, category: l.category, supplier: l.supplier, budget: l.budget_cents,
          actual: l.actual_cents, deposit: l.deposit_cents, payment_due: l.payment_due, paid: l.paid,
        }))}
      />

      <section className="card p-5">
        <h2 className="mb-3 text-lg">Werkelijke kosten per categorie</h2>
        <CostPie parts={costsByCategory(lines)} />
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-lg">Kostenpost toevoegen</h2>
        <form action={addExtraCost} className="grid gap-3 sm:grid-cols-6">
          <input type="hidden" name="coupleId" value={couple.id} />
          <div className="sm:col-span-3"><label className="label" htmlFor="n-new">Kostenpost</label><input id="n-new" name="name" required className="input" placeholder="Bijvoorbeeld: Bedankjes" /></div>
          <div className="sm:col-span-3">
            <label className="label" htmlFor="c-new">Categorie</label>
            <select id="c-new" name="category" className="input" defaultValue="">
              <option value="">Kies een categorie</option>
              {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2"><label className="label" htmlFor="s-new">Leverancier</label><input id="s-new" name="supplier" className="input" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="a-new">Werkelijk (€)</label><input id="a-new" name="actual" inputMode="decimal" className="input" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="d-new">Aanbetaald (€)</label><input id="d-new" name="deposit" inputMode="decimal" className="input" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="p-new">Betaaldatum</label><input id="p-new" name="paymentDue" type="date" className="input" /></div>
          <label className="flex items-end gap-2 pb-3 text-sm sm:col-span-2"><input type="checkbox" name="paid" className="accent-[#6B1E2E]" /> Volledig betaald</label>
          <div className="sm:col-span-6"><SubmitButton className="btn-primary" pendingText="Opslaan…">Toevoegen</SubmitButton></div>
        </form>
      </section>
    </div>
  );
}
