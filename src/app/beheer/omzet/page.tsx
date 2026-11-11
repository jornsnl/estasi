import Link from "next/link";
import { requireOwner } from "@/lib/auth/session";
import { query } from "@/lib/ws/db";
import { coupleName, formatDate, formatMoney, todayIso } from "@/lib/ws/format";
import {
  isPeriod,
  PAYMENT_PLAN_LABELS,
  PAYMENT_STATUS_LABELS,
  PERIOD_LABELS,
  PERIODS,
  paymentState,
  periodRange,
  revenueSummary,
  type PaymentPlan,
  type Period,
} from "@/lib/ws/payments";

export const metadata = { title: "Omzet" };

interface SaleRow {
  id: string;
  partner1_first: string;
  partner2_first: string;
  status: "concept" | "active" | "archived";
  sold_on: string;
  agreed_price_cents: number | null;
  payment_plan: PaymentPlan;
  paid_first_at: Date | null;
  paid_second_at: Date | null;
  package_names: string[];
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STATUS_TONE = { geen_prijs: "text-muted", betaald: "text-success", deels: "text-gold-ink", open: "text-bordeaux" } as const;

/**
 * Pipeline, Omzet (feedback Sabine): packages sold and revenue per year or quarter, who pays at
 * once and who in two halves, and every amount that is still open. The price, the payment plan
 * and the payments are filled in per couple (Gegevens & delen, or when adding a couple).
 */
export default async function RevenuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const params = await searchParams;
  const rows = await query<SaleRow>(
    `select c.id, c.partner1_first, c.partner2_first, c.status, c.sold_on, c.agreed_price_cents, c.payment_plan, c.paid_first_at, c.paid_second_at,
            coalesce((select array_agg(p.name || case when p.variant <> '' then ' (' || p.variant || ')' else '' end order by p.position)
                        from couple_packages cp join packages p on p.id = cp.package_id where cp.couple_id = c.id), '{}') as package_names
       from couples c
      order by c.sold_on desc, c.created_at desc`,
  );
  const thisYear = Number(todayIso().slice(0, 4));
  const years = [...new Set([thisYear, ...rows.map((r) => Number(r.sold_on.slice(0, 4)))])].sort((a, b) => b - a);
  const yearParam = Number(one(params.jaar));
  const year = years.includes(yearParam) ? yearParam : thisYear;
  const periodParam = one(params.periode);
  const period: Period = isPeriod(periodParam) ? periodParam : "jaar";
  const range = periodRange(year, period);

  const withCounts = rows.map((r) => ({ ...r, packages: r.package_names.length }));
  const summary = revenueSummary(withCounts, range);
  const sold = withCounts.filter((r) => r.sold_on >= range.from && r.sold_on <= range.to);
  const perPackage = new Map<string, number>();
  for (const r of sold) for (const name of r.package_names) perPackage.set(name, (perPackage.get(name) ?? 0) + 1);

  // Open amounts over all periods: everything a couple still has to pay.
  const open = rows
    .map((r) => ({ row: r, state: paymentState(r) }))
    .filter((x) => x.state.open > 0)
    .sort((a, b) => b.state.open - a.state.open);
  const openTotal = open.reduce((sum, x) => sum + x.state.open, 0);
  const href = (y: number, p: Period) => `/beheer/omzet?jaar=${y}${p === "jaar" ? "" : `&periode=${p}`}`;

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Pipeline</p>
        <h1 className="mt-1 text-3xl">Omzet</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Verkochte pakketten en omzet per jaar of kwartaal, op basis van de afgesproken prijs en de verkoopdatum per bruidspaar. Die vul je in bij{" "}
          <span className="text-ink">Nieuw bruidspaar</span> of later bij Gegevens & delen.
        </p>
      </header>

      <nav aria-label="Periode" className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-line text-sm">
          {years.map((y) => (
            <Link key={y} href={href(y, period)} aria-current={y === year ? "true" : undefined} className={`px-3 py-2 ${y === year ? "bg-bordeaux text-white" : "bg-white text-muted hover:text-ink"}`}>
              {y}
            </Link>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-lg border border-line text-sm">
          {PERIODS.map((p) => (
            <Link key={p} href={href(year, p)} aria-current={p === period ? "true" : undefined} className={`px-3 py-2 ${p === period ? "bg-bordeaux text-white" : "bg-white text-muted hover:text-ink"}`}>
              {PERIOD_LABELS[p]}
            </Link>
          ))}
        </div>
        <span className="text-sm text-muted">{formatDate(range.from)} tot en met {formatDate(range.to)}</span>
      </nav>

      <section aria-label="Totalen" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Pakketten verkocht" value={String(summary.packages)} note={`${summary.couples} ${summary.couples === 1 ? "bruidspaar" : "bruidsparen"}`} />
        {/* Feedback Sabine (9): prices are entered including 21% VAT; revenue is shown without it. */}
        <Tile
          label="Omzet (excl. btw)"
          value={formatMoney(summary.revenueExVat)}
          note={`${formatMoney(summary.revenue)} incl. 21% btw${summary.withoutPrice ? ` · ${summary.withoutPrice} zonder prijs, telt nog niet mee` : ""}`}
        />
        <Tile label="Al betaald" value={formatMoney(summary.paid)} note={`nog open: ${formatMoney(summary.open)}`} />
        <Tile label="Betaalwijze" value={`${summary.once} × 1 · ${summary.two} × 2`} note="in één keer · in twee keer" />
      </section>

      {perPackage.size > 0 && (
        <section className="card p-5">
          <h2 className="text-xl">Per pakket</h2>
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {[...perPackage.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => (
              <li key={name} className="rounded-full bg-cream px-3 py-1">{name}: <strong>{n}</strong></li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-2xl">Verkocht in deze periode</h2>
        {sold.length === 0 ? (
          <p className="card p-5 text-sm text-muted">Geen bruidsparen verkocht in deze periode.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-3 font-medium">Bruidspaar</th>
                  <th className="px-4 py-3 font-medium">Verkocht</th>
                  <th className="px-4 py-3 font-medium">Pakket</th>
                  <th className="px-4 py-3 text-right font-medium">Prijs</th>
                  <th className="px-4 py-3 font-medium">Betaalwijze</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sold.map((r) => {
                  const state = paymentState(r);
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-3"><Link href={`/k/${r.id}/gegevens#betaling`} className="font-medium hover:text-bordeaux">{coupleName(r)}</Link></td>
                      <td className="px-4 py-3 text-muted">{formatDate(r.sold_on)}</td>
                      <td className="px-4 py-3 text-muted">{r.package_names.join(" + ") || "–"}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(r.agreed_price_cents)}</td>
                      <td className="px-4 py-3">{r.payment_plan === "two" ? "2 keer" : "1 keer"}</td>
                      <td className={`px-4 py-3 ${STATUS_TONE[state.status]}`}>{PAYMENT_STATUS_LABELS[state.status]}</td>
                      <td className="px-4 py-3 text-right">{state.open ? formatMoney(state.open) : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl">Openstaande bedragen</h2>
          <p className="text-sm">Totaal open: <strong className="text-bordeaux">{formatMoney(openTotal)}</strong></p>
        </div>
        <p className="text-sm text-muted">Alle bruidsparen die nog iets moeten betalen, ongeacht de periode.</p>
        {open.length === 0 ? (
          <p className="card p-5 text-sm text-muted">Alles is betaald.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {open.map(({ row, state }) => (
              <li key={row.id}>
                <Link href={`/k/${row.id}/gegevens#betaling`} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 hover:bg-cream/60">
                  <span>
                    <span className="font-medium">{coupleName(row)}</span>
                    <span className="text-muted"> · {PAYMENT_PLAN_LABELS[row.payment_plan].toLowerCase()}{row.payment_plan === "two" && state.paid > 0 ? ", eerste helft betaald" : ""}</span>
                  </span>
                  <span className="text-sm"><strong className="text-bordeaux">{formatMoney(state.open)}</strong> <span className="text-muted">van {formatMoney(state.price)}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-serif text-3xl">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  );
}
