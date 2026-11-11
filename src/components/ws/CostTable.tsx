"use client";

import { useState, useTransition } from "react";
import { AutoTextarea } from "./AutoTextarea";
import { deleteCost, updateCost } from "@/app/actions/ws-costs";
import { costDifference, costRemaining, payingSoon } from "@/lib/ws/pure";

export interface CostRow {
  id: string;
  kind: "category" | "own" | "extra" | "package";
  name: string;
  category: string;
  supplier: string;
  budget: number;
  actual: number | null;
  deposit: number | null;
  payment_due: string | null;
  paid: boolean;
}

const euro = (cents: number | null) => (cents === null ? "" : `€ ${(cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const field = (cents: number | null) => (cents === null ? "" : (cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: cents % 100 ? 2 : 0 }));
const parse = (v: string) => {
  const raw = v.replace(/[€\s]/g, "");
  if (!raw) return null;
  const n = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

/**
 * The cost overview: amounts, dates and "Betaald" can be changed in the table
 * itself. Begroot (from the budget), Verschil and Resterend are worked out.
 */
export function CostTable({ coupleId, rows, categories, isAdmin, today }: { coupleId: string; rows: CostRow[]; categories: string[]; isAdmin: boolean; today: string }) {
  const [data, setData] = useState(rows);
  const [status, setStatus] = useState("");
  const [, start] = useTransition();
  const change = (row: CostRow, field: Parameters<typeof updateCost>[2], value: string | boolean, patch: Partial<CostRow>) => {
    setData((d) => d.map((r) => (r.id === row.id ? { ...r, ...patch } : r)));
    start(async () => {
      const r = await updateCost(coupleId, row.id, field, value);
      setStatus(r.ok ? "✓ Opgeslagen" : r.error ?? "Niet opgeslagen");
    });
  };
  // On a phone the fields have a light border, so it is clear they can be filled in.
  const cell = "w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-line focus:border-line focus:bg-white disabled:hover:border-transparent max-sm:border-line max-sm:bg-white max-sm:disabled:border-transparent max-sm:disabled:bg-transparent";

  return (
    <div className="card overflow-x-auto">
      <datalist id="cost-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      <table className="stack-table stack-3 w-full text-sm sm:min-w-[1080px]">
        <thead className="table-head">
          <tr>
            <th className="px-3 py-2">Kostenpost</th><th className="px-3 py-2">Categorie</th><th className="px-3 py-2">Leverancier</th>
            <th className="px-3 py-2 text-right">Begroot</th><th className="px-3 py-2 text-right">Werkelijk</th><th className="px-3 py-2 text-right">Verschil</th>
            <th className="px-3 py-2 text-right">Aanbetaald</th><th className="px-3 py-2 text-right">Resterend</th><th className="px-3 py-2">Betaaldatum</th>
            <th className="px-3 py-2 text-center">Betaald</th><th />
          </tr>
        </thead>
        <tbody>
          {data.map((r) => {
            const locked = r.kind === "package" && !isAdmin;
            const diff = costDifference(r.budget, r.actual);
            const remaining = costRemaining(r.actual, r.deposit, r.paid);
            const soon = payingSoon(r.payment_due, r.paid, today);
            return (
              <tr key={r.id} className={`border-t border-line align-top ${r.kind === "package" ? "bg-cream/70" : ""}`}>
                <td className="stack-full px-3 py-1.5">
                  {r.kind === "own" || r.kind === "extra" ? (
                    <input defaultValue={r.name} aria-label="Kostenpost" onBlur={(e) => e.target.value !== e.target.defaultValue && change(r, "name", e.target.value, { name: e.target.value })} className={cell} />
                  ) : (
                    <span className="px-1">{r.name}</span>
                  )}
                  {r.kind === "package" && <span className="ml-1 rounded-full bg-bordeaux-soft px-1.5 text-[10px] text-bordeaux">Pakket Estasi</span>}
                  {soon && <span className="ml-1 rounded-full bg-[#fbe3d0] px-1.5 text-[10px] text-[#8a4b1c]">Binnenkort betalen</span>}
                </td>
                <td data-label="Categorie" className="px-3 py-1.5">
                  {r.kind === "extra" ? (
                    <select defaultValue={r.category} aria-label="Categorie" onChange={(e) => change(r, "category", e.target.value, { category: e.target.value })} className={cell}>
                      <option value="">–</option>
                      {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <span className="px-1 text-muted">{r.category}</span>
                  )}
                </td>
                <td data-label="Leverancier" className="stack-span-2 px-3 py-1.5 sm:min-w-[10rem]">
                  {/* Feedback Sabine (20): the cell grows with the name instead of cutting it off. */}
                  <AutoTextarea key={r.supplier} defaultValue={r.supplier} disabled={r.kind === "package"} aria-label="Leverancier" onBlur={(e) => e.target.value !== e.target.defaultValue && change(r, "supplier", e.target.value.trim(), { supplier: e.target.value.trim() })} className={`${cell} block leading-snug`} />
                </td>
                <td data-label="Begroot" className="px-3 py-1.5 text-right whitespace-nowrap text-muted" title="Komt uit de begroting">{r.budget ? euro(r.budget) : ""}</td>
                <td data-label="Werkelijk" className="px-3 py-1.5">
                  <input defaultValue={field(r.actual)} disabled={r.kind === "package"} inputMode="decimal" aria-label="Werkelijk" onBlur={(e) => e.target.value !== e.target.defaultValue && change(r, "actual", e.target.value, { actual: parse(e.target.value) })} className={`${cell} text-right`} />
                </td>
                <td data-label="Verschil" className={`px-3 py-1.5 text-right whitespace-nowrap ${diff === null ? "" : diff < 0 ? "bg-red-50 text-red-800" : "text-success"}`}>{diff === null || !r.budget ? "" : euro(diff)}</td>
                <td data-label="Aanbetaald" className="px-3 py-1.5">
                  <input defaultValue={field(r.deposit)} disabled={locked} inputMode="decimal" aria-label="Aanbetaald" onBlur={(e) => e.target.value !== e.target.defaultValue && change(r, "deposit", e.target.value, { deposit: parse(e.target.value) })} className={`${cell} text-right`} />
                </td>
                <td data-label="Resterend" className="px-3 py-1.5 text-right whitespace-nowrap">{euro(remaining)}</td>
                <td data-label="Betaaldatum" className="stack-span-2 px-3 py-1.5">
                  <input type="date" defaultValue={r.payment_due ?? ""} disabled={locked} aria-label="Betaaldatum" onChange={(e) => change(r, "payment_due", e.target.value, { payment_due: e.target.value || null })} className={cell} />
                </td>
                <td data-label="Betaald" className="px-3 py-1.5 text-center">
                  <input type="checkbox" checked={r.paid} disabled={locked} aria-label={`${r.name} betaald`} onChange={(e) => change(r, "paid", e.target.checked, { paid: e.target.checked })} className="h-4 w-4 accent-[#6B1E2E]" />
                </td>
                <td className="px-2 py-1.5">
                  {(r.kind === "own" || r.kind === "extra") && (
                    <form action={deleteCost} onSubmit={(e) => { if (!confirm(`"${r.name}" verwijderen?`)) e.preventDefault(); }}>
                      <input type="hidden" name="coupleId" value={coupleId} />
                      <input type="hidden" name="itemId" value={r.id} />
                      <button type="submit" className="text-muted hover:text-bordeaux" aria-label={`${r.name} verwijderen`}>×</button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-line px-3 py-2 text-xs text-muted" aria-live="polite">
        Begroot vullen jullie in bij de opdracht Budgetplanning; Verschil en Resterend rekenen zichzelf uit. {status}
      </p>
    </div>
  );
}

/** Real costs per category as a pie (inline SVG, both themes). */
export function CostPie({ parts }: { parts: { category: string; cents: number }[] }) {
  const total = parts.reduce((n, p) => n + p.cents, 0);
  if (total === 0) return <p className="text-sm text-muted">Het diagram verschijnt zodra er werkelijke kosten zijn ingevuld.</p>;
  const colors = ["#722f37", "#a89650", "#7e9c86", "#c98b6b", "#6b7fa3", "#b07aa1", "#d4b483", "#5f8f8b", "#9c6b5a", "#8a8578"];
  let angle = -Math.PI / 2;
  const slices = parts.map((p, i) => {
    const sweep = (p.cents / total) * Math.PI * 2;
    const [x1, y1] = [50 + 45 * Math.cos(angle), 50 + 45 * Math.sin(angle)];
    angle += sweep;
    const [x2, y2] = [50 + 45 * Math.cos(angle), 50 + 45 * Math.sin(angle)];
    const d = parts.length === 1 ? "M50 5 A45 45 0 1 1 49.99 5 Z" : `M50 50 L${x1} ${y1} A45 45 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
    return { ...p, d, color: colors[i % colors.length] };
  });
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 100 100" className="h-44 w-44" role="img" aria-label="Werkelijke kosten per categorie">
        {slices.map((s) => <path key={s.category} d={s.d} fill={s.color} stroke="#fff" strokeWidth="0.8"><title>{`${s.category}: ${euro(s.cents)}`}</title></path>)}
      </svg>
      <ul className="space-y-1 text-sm">
        {slices.map((s) => (
          <li key={s.category} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ background: s.color }} />
            {s.category} <span className="text-muted">{euro(s.cents)} ({Math.round((s.cents / total) * 100)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
