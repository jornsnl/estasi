"use client";

import { useState, useTransition } from "react";
import { addOwnPart, deleteCost, setPlanned, setTotalBudget } from "@/app/actions/ws-costs";
import { SubmitButton } from "@/components/SubmitButton";
import { budgetLine } from "@/lib/ws/pure";

const euro = (cents: number) => `€ ${(cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const field = (cents: number | null) => (cents ? (cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: cents % 100 ? 2 : 0 }) : "");
const parse = (v: string) => {
  const raw = v.replace(/[€\s]/g, "");
  const n = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/**
 * "Hoeveel willen jullie aan elk onderdeel besteden?" The total on top, a
 * line per supplier category plus own parts, and a running count. What is
 * filled in here shows on the cost overview as "Begroot".
 */
export function BudgetPlanner({
  coupleId,
  total,
  lines,
  back,
}: {
  coupleId: string;
  total: number | null;
  lines: { id: string; name: string; kind: "category" | "own"; budget: number }[];
  back: string;
}) {
  const [totalCents, setTotal] = useState(total);
  const [amounts, setAmounts] = useState(() => Object.fromEntries(lines.map((l) => [l.id, l.budget])));
  const [status, setStatus] = useState("");
  const [, start] = useTransition();
  const planned = Object.values(amounts).reduce((n, c) => n + c, 0);
  const line = budgetLine(planned, totalCents, euro);
  const save = (p: Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await p; setStatus(r.ok ? "✓ Opgeslagen" : r.error ?? "Niet opgeslagen"); });

  return (
    <section className="card space-y-4 p-5">
      <h2 className="text-xl">Hoeveel willen jullie aan elk onderdeel besteden?</h2>
      <label className="block max-w-xs">
        <span className="label">Totaalbudget</span>
        <span className="flex items-center gap-2">
          €
          <input
            defaultValue={field(total)}
            inputMode="decimal"
            placeholder="25.000"
            onBlur={(e) => {
              setTotal(parse(e.target.value) || null);
              save(setTotalBudget(coupleId, e.target.value));
            }}
            className="input"
            aria-label="Totaalbudget"
          />
        </span>
      </label>
      <p className={`rounded-lg px-3 py-2 text-sm font-medium ${line.over ? "bg-red-50 text-red-800" : "bg-cream"}`} aria-live="polite">{line.text}</p>

      <table className="w-full text-sm">
        <thead className="text-left text-xs text-bordeaux"><tr><th className="pb-1 font-medium">Onderdeel</th><th className="w-40 pb-1 font-medium">Begroot bedrag</th><th className="w-6" /></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-t border-line">
              <td className="py-1.5 pr-2">{l.name}</td>
              <td className="py-1.5">
                <span className="flex items-center gap-1">
                  €
                  <input
                    defaultValue={field(l.budget)}
                    inputMode="decimal"
                    aria-label={`Begroot bedrag ${l.name}`}
                    onChange={(e) => setAmounts((a) => ({ ...a, [l.id]: parse(e.target.value) }))}
                    onBlur={(e) => e.target.value !== e.target.defaultValue && (save(setPlanned(coupleId, l.id, e.target.value)), (e.target.defaultValue = e.target.value))}
                    className="input py-1 text-right"
                  />
                </span>
              </td>
              <td className="py-1.5 text-right">
                {l.kind === "own" && (
                  <form action={deleteCost} onSubmit={(e) => { if (!confirm(`${l.name} verwijderen?`)) e.preventDefault(); }}>
                    <input type="hidden" name="coupleId" value={coupleId} />
                    <input type="hidden" name="itemId" value={l.id} />
                    <input type="hidden" name="back" value={back} />
                    <button type="submit" className="text-muted hover:text-bordeaux" aria-label={`${l.name} verwijderen`}>×</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form action={addOwnPart} className="flex flex-wrap gap-2">
        <input type="hidden" name="coupleId" value={coupleId} />
        <input type="hidden" name="back" value={back} />
        <input name="name" required placeholder="Eigen onderdeel, bijvoorbeeld Trouwkaarten" aria-label="Eigen onderdeel" className="input min-w-56 flex-1 py-1.5" />
        <input name="budget" inputMode="decimal" placeholder="Bedrag" aria-label="Begroot bedrag" className="input w-32 py-1.5" />
        <SubmitButton className="btn-secondary py-1.5">Toevoegen</SubmitButton>
      </form>
      <p className="text-xs text-muted">De begrote bedragen staan meteen in het kostenoverzicht. {status}</p>
    </section>
  );
}
