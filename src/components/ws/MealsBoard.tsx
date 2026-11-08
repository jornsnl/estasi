"use client";

import { Fragment, useState, useTransition } from "react";
import { deleteMealRow, setGuestMeal, setMealCell, updateMealRow, updateMoment } from "@/app/actions/ws-meals";
import { AutoTextarea } from "@/components/ws/AutoTextarea";
import { mealTotal, partialCount, partialRowsIndex } from "@/lib/ws/guest-counts";
import { dietSummary } from "@/lib/ws/pure";

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
  group_kind: "day" | "evening" | "custom" | null;
  diet: string;
  summary: string;
  cells: Record<string, { checked: boolean; count: number }>;
}
export interface PartGuest {
  id: string;
  name: string;
  group: string;
  is_kid: boolean;
  diet: string;
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

/** The table: who eats along, per moment. Guests there part of the day sit right under the day guests. */
export function MealTable({ coupleId, moments, rows, partial }: { coupleId: string; moments: Moment[]; rows: Row[]; partial: PartGuest[] }) {
  const { status, run } = useSaver();
  const [cells, setCells] = useState(() => Object.fromEntries(rows.map((r) => [r.id, r.cells])));
  const [guests, setGuests] = useState(() => Object.fromEntries(partial.map((g) => [g.id, { excluded: g.excluded, reviewed: g.reviewed }])));
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({ adults: partial.some((g) => !g.is_kid && !g.reviewed), kids: partial.some((g) => g.is_kid && !g.reviewed) }));
  const active = moments.filter((m) => m.active);
  const cell = (row: Row, m: Moment) => cells[row.id]?.[m.id] ?? { checked: false, count: 0 };
  const setCell = (row: Row, m: Moment, value: { checked?: boolean; count?: number }) => {
    setCells((c) => ({ ...c, [row.id]: { ...c[row.id], [m.id]: { ...cell(row, m), ...value } } }));
    run(setMealCell(coupleId, row.id, m.id, value));
  };
  const countGuests = partial.map((g) => ({ id: g.id, group_id: null, is_kid: g.is_kid, attendance: "partial", excluded: guests[g.id].excluded }));
  const toggle = (g: PartGuest, m: Moment, eats: boolean) => {
    setGuests((s) => ({ ...s, [g.id]: { reviewed: true, excluded: eats ? s[g.id].excluded.filter((x) => x !== m.id) : [...s[g.id].excluded, m.id] } }));
    run(setGuestMeal(coupleId, g.id, m.id, eats));
  };
  const at = partialRowsIndex(rows);

  const partialRows = ([["adults", false, "Deel van de dag, volwassenen"], ["kids", true, "Deel van de dag, kinderen"]] as const).map(([key, kids, label]) => {
    const list = partial.filter((g) => g.is_kid === kids);
    const unchecked = list.filter((g) => !guests[g.id].reviewed).length;
    return (
      <Fragment key={key}>
        <tr className="border-t border-line bg-cream/70 align-top">
          <td className="px-3 py-1.5">
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
              aria-expanded={Boolean(open[key])}
              disabled={list.length === 0}
              className="text-left disabled:cursor-default"
            >
              {list.length > 0 && <span aria-hidden className="mr-1 inline-block w-3 text-bordeaux">{open[key] ? "▾" : "▸"}</span>}
              {label} <span className="ml-1 rounded-full bg-gold-soft px-1.5 text-[10px] text-gold-ink">RSVP</span>
              <span className="block text-[11px] text-muted">
                {list.length === 0 ? "Niemand" : `${list.length} ${list.length === 1 ? "gast" : "gasten"}`}
                {unchecked > 0 && <span className="ml-1 rounded-full bg-[#fbe3d0] px-1.5 text-[10px] text-[#8a4b1c]">{unchecked} nog controleren</span>}
              </span>
            </button>
          </td>
          {active.map((m) => <td key={m.id} className="px-2 py-1.5 text-center">{partialCount(countGuests, kids, m.id)}</td>)}
          <td className="px-3 py-1.5"><span className="text-xs text-muted">{dietSummary(list.map((g) => g.diet)) || "–"}</span></td>
          <td />
        </tr>
        {open[key] &&
          list.map((g) => (
            <tr key={g.id} className="border-t border-line/60 align-top text-[13px]">
              <td className="py-1 pr-3 pl-8">
                {g.name}
                {!guests[g.id].reviewed && (
                  <button
                    type="button"
                    onClick={() => { setGuests((s) => ({ ...s, [g.id]: { ...s[g.id], reviewed: true } })); run(setGuestMeal(coupleId, g.id, null, true)); }}
                    className="ml-1 rounded-full bg-[#fbe3d0] px-1.5 text-[10px] text-[#8a4b1c]"
                    title="Klik als het klopt"
                  >
                    Nog controleren
                  </button>
                )}
                <span className="block text-[11px] text-muted">{[g.group, g.partial_note].filter(Boolean).join(" · ")}</span>
              </td>
              {active.map((m) => (
                <td key={m.id} className="px-2 py-1 text-center">
                  <input type="checkbox" checked={!guests[g.id].excluded.includes(m.id)} onChange={(e) => toggle(g, m, e.target.checked)} aria-label={`${g.name} eet mee bij ${m.name}`} className="h-4 w-4 accent-[#6B1E2E]" />
                </td>
              ))}
              <td className="px-3 py-1 text-xs text-muted">{g.diet || "–"}</td>
              <td />
            </tr>
          ))}
      </Fragment>
    );
  });

  const rowEl = (r: Row) => (
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
  );

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
          {rows.slice(0, at).map(rowEl)}
          {partialRows}
          {rows.slice(at).map(rowEl)}
          <tr className="border-t-2 border-ink font-semibold">
            <td className="px-3 py-2">Totaal</td>
            {active.map((m) => (
              <td key={m.id} className="px-2 py-2 text-center">{mealTotal(rows.map((r) => ({ kind: r.kind, cells: cells[r.id] ?? {} })), countGuests, m.id)}</td>
            ))}
            <td colSpan={2} className="px-3 py-2 text-xs font-normal text-muted" aria-live="polite">{status}</td>
          </tr>
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
