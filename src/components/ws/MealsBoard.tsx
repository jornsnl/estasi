"use client";

import { useState, useTransition } from "react";
import { deleteMealRow, setGuestMeal, setMealCell, updateMealRow, updateMoment } from "@/app/actions/ws-meals";
import { AutoTextarea } from "@/components/ws/AutoTextarea";

export interface Moment {
  id: string;
  name: string;
  active: boolean;
  at_time: string;
  caterer: string;
  menu: string;
  updated: string;
}
export interface Row {
  id: string;
  kind: "person" | "group" | "rsvp";
  name: string;
  role: string;
  diet: string;
  summary: string;
  cells: Record<string, { checked: boolean; count: number }>;
}
export interface PartGuest {
  id: string;
  name: string;
  group: string;
  is_kid: boolean;
  partial_note: string;
  reviewed: boolean;
  excluded: string[];
}

const useSaver = () => {
  const [status, setStatus] = useState("");
  const [, start] = useTransition();
  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await p;
      setStatus(r.ok ? "✓ Opgeslagen" : r.error ?? "Niet opgeslagen");
    });
  return { status, run };
};

/** "Wat wordt er gegeten": per active moment what, by whom, and who changed it last. */
export function MenuBlocks({ coupleId, moments, caterers }: { coupleId: string; moments: Moment[]; caterers: string[] }) {
  const { status, run } = useSaver();
  const [updated, setUpdated] = useState(() => Object.fromEntries(moments.map((m) => [m.id, m.updated])));
  const save = (id: string, change: Parameters<typeof updateMoment>[2]) =>
    run(
      updateMoment(coupleId, id, change).then((r) => {
        if (r.ok && (change.menu !== undefined || change.caterer !== undefined)) setUpdated((u) => ({ ...u, [id]: `Laatst aangepast door ${r.by}, zojuist` }));
        return r;
      }),
    );
  const blur = (id: string, field: "menu" | "caterer" | "at_time") => (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.target.value !== e.target.defaultValue) {
      save(id, { [field]: e.target.value });
      e.target.defaultValue = e.target.value;
    }
  };
  return (
    <div className="space-y-2">
      <datalist id="caterers">{caterers.map((c) => <option key={c} value={c} />)}</datalist>
      <p className="h-4 text-right text-xs text-muted" aria-live="polite">{status}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {moments.filter((m) => m.active).map((m) => (
          <div key={m.id} className="card space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-serif text-lg font-semibold">{m.name}</h3>
              <input defaultValue={m.at_time} onBlur={blur(m.id, "at_time")} placeholder="Tijd" aria-label={`Tijd ${m.name}`} className="input w-24 py-1 text-sm" />
            </div>
            <label className="block text-xs text-muted">
              Wat wordt er gegeten
              <AutoTextarea defaultValue={m.menu} onBlur={blur(m.id, "menu")} className="input mt-0.5 min-h-16 text-sm text-ink" />
            </label>
            <label className="block text-xs text-muted">
              Door wie
              <input list="caterers" defaultValue={m.caterer} onBlur={blur(m.id, "caterer")} placeholder="Leverancier of naam" className="input mt-0.5 py-1.5 text-sm text-ink" />
            </label>
            {updated[m.id] && <p className="text-[11px] text-muted">{updated[m.id]}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The table: who eats along, per moment. */
export function MealTable({ coupleId, moments, rows, totals }: { coupleId: string; moments: Moment[]; rows: Row[]; totals: Record<string, number> }) {
  const { status, run } = useSaver();
  const [cells, setCells] = useState(() => Object.fromEntries(rows.map((r) => [r.id, r.cells])));
  const active = moments.filter((m) => m.active);
  const cell = (row: Row, m: Moment) => cells[row.id]?.[m.id] ?? { checked: false, count: 0 };
  const setCell = (row: Row, m: Moment, value: { checked?: boolean; count?: number }) => {
    setCells((c) => ({ ...c, [row.id]: { ...c[row.id], [m.id]: { ...cell(row, m), ...value } } }));
    run(setMealCell(coupleId, row.id, m.id, value));
  };
  const total = (m: Moment) =>
    rows.reduce((n, r) => {
      const c = cell(r, m);
      return n + (r.kind === "person" ? (c.checked ? 1 : 0) : r.kind === "group" ? c.count : c.checked ? c.count : 0);
    }, 0);
  void totals;

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="table-head">
          <tr>
            <th className="min-w-44 px-3 py-2">Wie eet er mee</th>
            {active.map((m) => <th key={m.id} className="px-2 py-2 text-center whitespace-nowrap">{m.name}{m.at_time && <span className="block text-[10px] font-normal">{m.at_time}</span>}</th>)}
            <th className="px-3 py-2">Allergieën / dieetwensen</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`border-t border-line align-top ${r.kind === "rsvp" ? "bg-cream/70" : ""}`}>
              <td className="px-3 py-1.5">
                {r.kind === "rsvp" ? (
                  <span>{r.name} <span className="ml-1 rounded-full bg-gold-soft px-1.5 text-[10px] text-gold-ink">RSVP</span></span>
                ) : (
                  <>
                    <input defaultValue={r.name} aria-label="Naam" onBlur={(e) => e.target.value !== e.target.defaultValue && run(updateMealRow(coupleId, r.id, { name: e.target.value }))} className="w-full rounded border border-transparent bg-transparent px-1 hover:border-line focus:border-line focus:bg-white" />
                    {r.kind === "person" && (
                      <input defaultValue={r.role} placeholder="Rol" aria-label="Rol" onBlur={(e) => e.target.value !== e.target.defaultValue && run(updateMealRow(coupleId, r.id, { role: e.target.value }))} className="w-full rounded border border-transparent bg-transparent px-1 text-xs text-muted hover:border-line focus:border-line focus:bg-white" />
                    )}
                  </>
                )}
              </td>
              {active.map((m) => {
                const c = cell(r, m);
                return (
                  <td key={m.id} className="px-2 py-1.5 text-center">
                    {r.kind === "person" && (
                      <input type="checkbox" checked={c.checked} onChange={(e) => setCell(r, m, { checked: e.target.checked })} aria-label={`${r.name} eet mee bij ${m.name}`} className="h-4 w-4 accent-[#6B1E2E]" />
                    )}
                    {r.kind === "group" && (
                      <input type="number" min={0} defaultValue={c.count || ""} onBlur={(e) => Number(e.target.value || 0) !== c.count && setCell(r, m, { count: Number(e.target.value || 0) })} aria-label={`Aantal ${r.name} bij ${m.name}`} className="input w-16 px-1 py-0.5 text-center text-sm" />
                    )}
                    {r.kind === "rsvp" && (
                      <label className="inline-flex items-center gap-1" title="Aan: deze groep eet mee; het aantal komt uit de RSVP">
                        <input type="checkbox" checked={c.checked} onChange={(e) => setCell(r, m, { checked: e.target.checked })} aria-label={`${r.name} eet mee bij ${m.name}`} className="h-4 w-4 accent-[#6B1E2E]" />
                        <span className={c.checked ? "" : "text-muted line-through"}>{c.count}</span>
                      </label>
                    )}
                  </td>
                );
              })}
              <td className="px-3 py-1.5">
                {r.kind === "rsvp" ? (
                  <span className="text-xs text-muted">{r.summary || "–"}</span>
                ) : (
                  <input defaultValue={r.diet} placeholder="–" aria-label={`Allergieën ${r.name}`} onBlur={(e) => e.target.value !== e.target.defaultValue && run(updateMealRow(coupleId, r.id, { diet: e.target.value }))} className="w-full rounded border border-transparent bg-transparent px-1 hover:border-line focus:border-line focus:bg-white" />
                )}
              </td>
              <td className="px-2 py-1.5">
                {r.kind !== "rsvp" && (
                  <form action={deleteMealRow} onSubmit={(e) => { if (!confirm(`${r.name} verwijderen?`)) e.preventDefault(); }}>
                    <input type="hidden" name="coupleId" value={coupleId} />
                    <input type="hidden" name="rowId" value={r.id} />
                    <button type="submit" className="text-muted hover:text-bordeaux" aria-label={`${r.name} verwijderen`}>×</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-ink font-semibold">
            <td className="px-3 py-2">Totaal</td>
            {active.map((m) => <td key={m.id} className="px-2 py-2 text-center">{total(m)}</td>)}
            <td colSpan={2} className="px-3 py-2 text-xs font-normal text-muted" aria-live="polite">{status}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** "Deel van de dag aanwezig": per guest the moments they eat along; unticking lowers the group number. */
export function PartOfDayList({ coupleId, moments, guests }: { coupleId: string; moments: Moment[]; guests: PartGuest[] }) {
  const { status, run } = useSaver();
  const [state, setState] = useState(() => Object.fromEntries(guests.map((g) => [g.id, { excluded: g.excluded, reviewed: g.reviewed }])));
  const active = moments.filter((m) => m.active);
  const toggle = (g: PartGuest, m: Moment, eats: boolean) => {
    setState((s) => ({ ...s, [g.id]: { reviewed: true, excluded: eats ? s[g.id].excluded.filter((x) => x !== m.id) : [...s[g.id].excluded, m.id] } }));
    run(setGuestMeal(coupleId, g.id, m.id, eats));
  };
  return (
    <div className="overflow-x-auto">
      <p className="h-4 text-right text-xs text-muted" aria-live="polite">{status}</p>
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-xs text-bordeaux">
          <tr><th className="py-1 pr-2">Gast</th><th className="py-1 pr-2">Groep</th><th className="py-1 pr-2">Antwoord</th>{active.map((m) => <th key={m.id} className="px-1 py-1 text-center">{m.name}</th>)}</tr>
        </thead>
        <tbody>
          {guests.map((g) => (
            <tr key={g.id} className="border-t border-line align-top">
              <td className="py-1.5 pr-2">
                {g.name}{g.is_kid && <span className="ml-1 rounded-full bg-gold-soft px-1.5 text-[10px] text-gold-ink">kind</span>}
                {!state[g.id].reviewed && (
                  <button type="button" onClick={() => { setState((s) => ({ ...s, [g.id]: { ...s[g.id], reviewed: true } })); run(setGuestMeal(coupleId, g.id, null, true)); }} className="ml-1 rounded-full bg-[#fbe3d0] px-1.5 text-[10px] text-[#8a4b1c]" title="Klik als het klopt">
                    Nog controleren
                  </button>
                )}
              </td>
              <td className="py-1.5 pr-2 text-muted">{g.group}</td>
              <td className="py-1.5 pr-2 text-muted">{g.partial_note}</td>
              {active.map((m) => (
                <td key={m.id} className="px-1 py-1.5 text-center">
                  <input type="checkbox" checked={!state[g.id].excluded.includes(m.id)} onChange={(e) => toggle(g, m, e.target.checked)} aria-label={`${g.name} eet mee bij ${m.name}`} className="h-4 w-4 accent-[#6B1E2E]" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Kopieer lijst": plain text for a mail to the caterer. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="btn-secondary py-1.5 text-xs"
    >
      {copied ? "✓ Gekopieerd" : "Kopieer lijst"}
    </button>
  );
}
