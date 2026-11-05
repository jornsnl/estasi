import { deleteBudgetItem, saveBudgetItem } from "@/app/actions/ws-portal";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { requireCouple } from "@/lib/ws/access";
import { query } from "@/lib/ws/db";
import { budgetTotals } from "@/lib/ws/budget";
import { formatDate, formatMoney } from "@/lib/ws/format";
import type { BudgetItem } from "@/lib/ws/types";

export const metadata = { title: "Kostenoverzicht" };

const money = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));

function ItemForm({ coupleId, item }: { coupleId: string; item?: BudgetItem }) {
  const id = item?.id ?? "nieuw";
  return (
    <form action={saveBudgetItem} className="grid gap-3 sm:grid-cols-6">
      <input type="hidden" name="coupleId" value={coupleId} />
      {item && <input type="hidden" name="itemId" value={item.id} />}
      <div className="sm:col-span-3"><label className="label" htmlFor={`n-${id}`}>Kostenpost</label><input id={`n-${id}`} name="name" required defaultValue={item?.name} className="input" placeholder="Bijvoorbeeld: Catering" /></div>
      <div className="sm:col-span-3"><label className="label" htmlFor={`c-${id}`}>Categorie</label><input id={`c-${id}`} name="category" defaultValue={item?.category} className="input" list="budget-categories" /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor={`b-${id}`}>Begroot (€)</label><input id={`b-${id}`} name="budget" inputMode="decimal" defaultValue={money(item?.budget_cents ?? null)} className="input" placeholder="0" /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor={`a-${id}`}>Werkelijk (€)</label><input id={`a-${id}`} name="actual" inputMode="decimal" defaultValue={money(item?.actual_cents ?? null)} className="input" /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor={`d-${id}`}>Aanbetaling (€)</label><input id={`d-${id}`} name="deposit" inputMode="decimal" defaultValue={money(item?.deposit_cents ?? null)} className="input" /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor={`dd-${id}`}>Aanbetalen vóór</label><input id={`dd-${id}`} name="depositDue" type="date" defaultValue={item?.deposit_due ?? ""} className="input" /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor={`pd-${id}`}>Betalen vóór</label><input id={`pd-${id}`} name="paymentDue" type="date" defaultValue={item?.payment_due ?? ""} className="input" /></div>
      <label className="flex items-end gap-2 pb-3 text-sm sm:col-span-2"><input type="checkbox" name="paid" defaultChecked={item?.paid} className="accent-[#6B1E2E]" /> Volledig betaald</label>
      <div className="sm:col-span-6"><SubmitButton className="btn-primary" pendingText="Opslaan…">{item ? "Opslaan" : "Toevoegen"}</SubmitButton></div>
    </form>
  );
}

export default async function BudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple } = await requireCouple(coupleId);
  const items = await query<BudgetItem>("select * from budget_items where couple_id = $1 order by position, created_at", [couple.id]);
  const totals = budgetTotals(items);

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Onderdeel</p>
        <h1 className="mt-1 text-3xl">Kostenoverzicht</h1>
        <p className="mt-1 text-sm text-muted">Begroting, werkelijke kosten en wat er nog betaald moet worden. Bedragen inclusief btw.</p>
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

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="table-head">
            <tr><th className="px-4 py-2.5">Kostenpost</th><th className="px-4 py-2.5 text-right">Begroot</th><th className="px-4 py-2.5 text-right">Werkelijk</th><th className="px-4 py-2.5">Betaling</th><th className="px-4 py-2.5 text-center">Betaald</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-line align-top">
                <td className="px-4 py-3">
                  <details>
                    <summary className="cursor-pointer">{item.name}{item.category && <span className="ml-2 text-xs text-muted">{item.category}</span>}</summary>
                    <div className="mt-3 rounded-xl bg-cream p-4">
                      <ItemForm coupleId={couple.id} item={item} />
                      <form action={deleteBudgetItem} className="mt-2">
                        <input type="hidden" name="coupleId" value={couple.id} />
                        <input type="hidden" name="itemId" value={item.id} />
                        <SubmitButton className="btn-ghost px-0 text-xs text-bordeaux" confirm={`"${item.name}" verwijderen?`}>Kostenpost verwijderen</SubmitButton>
                      </form>
                    </div>
                  </details>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatMoney(item.budget_cents)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatMoney(item.actual_cents)}</td>
                <td className="px-4 py-3 text-xs text-muted">
                  {item.deposit_cents ? <span className="block">Aanbetaling {formatMoney(item.deposit_cents)}{item.deposit_due ? ` vóór ${formatDate(item.deposit_due)}` : ""}</span> : null}
                  {item.payment_due ? <span className="block">Rest vóór {formatDate(item.payment_due)}</span> : null}
                </td>
                <td className="px-4 py-3 text-center">{item.paid ? <span className="text-success" aria-label="Betaald">✓</span> : <span className="text-muted">–</span>}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">Nog geen kostenposten.</td></tr>}
            {items.length > 0 && (
              <tr className="border-t border-line bg-cream font-medium">
                <td className="px-4 py-3">Totaal</td>
                <td className="px-4 py-3 text-right">{formatMoney(totals.budget)}</td>
                <td className="px-4 py-3 text-right">{formatMoney(totals.actual)}</td>
                <td colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="card p-5">
        <h2 className="mb-3 text-lg">Kostenpost toevoegen</h2>
        <ItemForm coupleId={couple.id} />
        <datalist id="budget-categories">
          {["Locatie", "Catering", "Styling", "Foto & video", "Entertainment", "Kleding", "Ceremonie", "Overig"].map((c) => <option key={c} value={c} />)}
        </datalist>
      </section>
    </div>
  );
}
