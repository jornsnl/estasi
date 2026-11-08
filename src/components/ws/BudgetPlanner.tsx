"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { addBudgetPart, deleteBudgetPart } from "@/app/actions/ws-costs";
import { budgetLine } from "@/lib/ws/pure";

const euro = (cents: number) => `€ ${(cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const field = (cents: number | null) => (cents ? (cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: cents % 100 ? 2 : 0 }) : "");
/** Dutch amounts as the server reads them ("1.250", "1250,50"); the browser blocks saving anything else. */
const AMOUNT = String.raw`\s*€?\s*((\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?|\d+\.\d{1,2})\s*`;
const AMOUNT_HINT = "Een bedrag, bijvoorbeeld 1.250 of 1250,50";
const parse = (v: string) => {
  const raw = v.replace(/[€\s]/g, "");
  const n = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/**
 * "Hoeveel willen jullie aan elk onderdeel besteden?" The total on top, a
 * line per supplier category plus own parts, and a running count. Sits inside
 * the answers form of the assignment: "Tussentijds opslaan" saves the answers
 * and these amounts at once, and the amounts show on Kosten as "Begroot".
 * Adding or removing an own part is saved right away.
 */
export function BudgetPlanner({
  coupleId,
  total,
  lines,
}: {
  coupleId: string;
  total: number | null;
  lines: { id: string; name: string; kind: "category" | "own"; budget: number }[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [totalCents, setTotal] = useState(total);
  const [amounts, setAmounts] = useState(() => Object.fromEntries(lines.map((l) => [l.id, l.budget])));
  const [own, setOwn] = useState({ name: "", budget: "" });
  const [pending, start] = useTransition();
  // A part added or removed: keep the typed amounts, take a new line's amount from the server.
  useEffect(() => {
    setAmounts((a) => Object.fromEntries(lines.map((l) => [l.id, a[l.id] ?? l.budget])));
  }, [lines]);
  const planned = lines.reduce((n, l) => n + (amounts[l.id] ?? 0), 0);
  const line = budgetLine(planned, totalCents, euro);
  // Saved right away without leaving the page, so amounts typed above and not saved yet stay put.
  const run = (action: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await action();
      setError(r.ok ? "" : r.error ?? "Niet gelukt.");
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  const addPart = () => {
    if (!own.name.trim()) return;
    run(() => addBudgetPart(coupleId, own.name, own.budget), () => setOwn({ name: "", budget: "" }));
  };
  const removePart = (id: string, name: string) => {
    if (!confirm(`${name} verwijderen?`)) return;
    run(() => deleteBudgetPart(coupleId, id));
  };
  const enterAdds = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addPart();
    }
  };

  return (
    <section className="card space-y-4 p-5">
      <h2 className="text-xl">Hoeveel willen jullie aan elk onderdeel besteden?</h2>
      <label className="block max-w-xs">
        <span className="label">Totaalbudget</span>
        <span className="flex items-center gap-2">
          €
          <input
            name="budgetTotal"
            defaultValue={field(total)}
            inputMode="decimal"
            placeholder="25.000"
            pattern={AMOUNT}
            title={AMOUNT_HINT}
            onChange={(e) => setTotal(parse(e.target.value) || null)}
            className="input"
            aria-label="Totaalbudget"
          />
        </span>
      </label>
      <p className={`rounded-lg px-3 py-2 text-sm font-medium ${line.over ? "bg-red-50 text-red-800" : "bg-cream"}`} aria-live="polite">{line.text}</p>

      <table className="w-full table-fixed text-sm">
        <colgroup><col /><col className="w-36 sm:w-44" /><col className="w-7" /></colgroup>
        <thead className="text-left text-xs text-bordeaux"><tr><th className="pb-1 font-medium">Onderdeel</th><th className="pb-1 font-medium">Begroot bedrag</th><th /></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-t border-line">
              <td className="py-1.5 pr-2 break-words">{l.name}</td>
              <td className="py-1.5">
                <span className="flex items-center gap-1">
                  €
                  <input
                    name={`budget-${l.id}`}
                    defaultValue={field(l.budget)}
                    inputMode="decimal"
                    aria-label={`Begroot bedrag ${l.name}`}
                    pattern={AMOUNT}
                    title={AMOUNT_HINT}
                    onChange={(e) => setAmounts((a) => ({ ...a, [l.id]: parse(e.target.value) }))}
                    className="input py-1 text-right"
                  />
                </span>
              </td>
              <td className="py-1.5 text-right">
                {l.kind === "own" && (
                  <button type="button" disabled={pending} onClick={() => removePart(l.id, l.name)} className="text-muted hover:text-bordeaux" aria-label={`${l.name} verwijderen`}>×</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Not part of the answers form (the form attribute points to no form): added right away with the button. */}
      <div className="flex flex-wrap gap-2">
        <input
          form="budget-own-part"
          value={own.name}
          onChange={(e) => setOwn((o) => ({ ...o, name: e.target.value }))}
          onKeyDown={enterAdds}
          placeholder="Eigen onderdeel, bijvoorbeeld Trouwkaarten"
          aria-label="Eigen onderdeel"
          className="input min-w-56 flex-1 py-1.5"
        />
        <input
          form="budget-own-part"
          value={own.budget}
          onChange={(e) => setOwn((o) => ({ ...o, budget: e.target.value }))}
          onKeyDown={enterAdds}
          inputMode="decimal"
          placeholder="Bedrag"
          aria-label="Begroot bedrag eigen onderdeel"
          className="input w-32 py-1.5"
        />
        <button type="button" onClick={addPart} disabled={pending || !own.name.trim()} className="btn-secondary py-1.5">{pending ? "Bezig…" : "Toevoegen"}</button>
      </div>
      {error && <p role="alert" className="text-sm text-bordeaux">{error}</p>}
      <p className="text-xs text-muted">Met &quot;Tussentijds opslaan&quot; hieronder bewaren jullie de antwoorden en alle bedragen in één keer; de begrote bedragen staan dan meteen bij Kosten.</p>
    </section>
  );
}
