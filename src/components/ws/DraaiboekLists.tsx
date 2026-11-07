"use client";

import { useMemo, useState, useTransition } from "react";
import { deleteGroupPhoto, deletePackingItem, moveGroupPhoto, updateGroupPhoto, updatePackingItem } from "@/app/actions/ws-lists";
import { updateDayGuest } from "@/app/actions/ws-rsvp";

const saved = (set: (s: string) => void) => (r: { ok: boolean; error?: string }) => set(r.ok ? "✓ Opgeslagen" : r.error ?? "Niet opgeslagen");

// Meeneemlijst ------------------------------------------------------------------------------------

export interface PackingItemData {
  id: string;
  what: string;
  who: string;
  packed: boolean;
  is_default: boolean;
  fromStyling?: boolean;
}

export function PackingList({ coupleId, items, isAdmin }: { coupleId: string; items: PackingItemData[]; isAdmin: boolean }) {
  const [packed, setPacked] = useState(() => Object.fromEntries(items.map((i) => [i.id, i.packed])));
  const [status, setStatus] = useState("");
  const [, start] = useTransition();
  const done = Object.values(packed).filter(Boolean).length;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="table-head">
          <tr><th className="px-3 py-2">Wat moet er mee</th><th className="px-3 py-2">Wie neemt het mee</th><th className="px-3 py-2 text-center">Ingepakt</th><th /></tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={`border-t border-line ${packed[item.id] ? "bg-success-soft/40" : ""}`}>
              <td className="px-3 py-1.5">
                {item.fromStyling || (item.is_default && !isAdmin) ? (
                  <span>{item.what}</span>
                ) : (
                  <input
                    defaultValue={item.what}
                    aria-label="Wat moet er mee"
                    onBlur={(e) => e.target.value !== e.target.defaultValue && start(async () => saved(setStatus)(await updatePackingItem(coupleId, item.id, { what: e.target.value })))}
                    className="input py-1 text-sm"
                  />
                )}
                {item.fromStyling && <span className="ml-2 rounded-full bg-gold-soft px-1.5 text-xs text-gold-ink">Uit stylingplan</span>}
              </td>
              <td className="px-3 py-1.5">
                {item.fromStyling ? (
                  <span>{item.who}</span>
                ) : (
                  <input
                    defaultValue={item.who}
                    aria-label="Wie neemt het mee"
                    onBlur={(e) => e.target.value !== e.target.defaultValue && start(async () => saved(setStatus)(await updatePackingItem(coupleId, item.id, { who: e.target.value })))}
                    className="input py-1 text-sm"
                  />
                )}
              </td>
              <td className="px-3 py-1.5 text-center">
                <input
                  type="checkbox"
                  checked={Boolean(packed[item.id])}
                  disabled={isAdmin || item.fromStyling}
                  title={isAdmin ? "Het bruidspaar vinkt dit af" : undefined}
                  aria-label={`${item.what} ingepakt`}
                  onChange={(e) => {
                    setPacked((p) => ({ ...p, [item.id]: e.target.checked }));
                    start(async () => saved(setStatus)(await updatePackingItem(coupleId, item.id, { packed: e.target.checked })));
                  }}
                  className="h-4 w-4 accent-[#6B1E2E]"
                />
              </td>
              <td className="px-2 py-1.5 text-right">
                {!item.fromStyling && (isAdmin || !item.is_default) && (
                  <form action={deletePackingItem} onSubmit={(e) => { if (!confirm(`"${item.what}" verwijderen?`)) e.preventDefault(); }}>
                    <input type="hidden" name="coupleId" value={coupleId} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <button type="submit" className="text-muted hover:text-bordeaux" aria-label={`${item.what} verwijderen`}>×</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-muted">Nog leeg.</td></tr>}
        </tbody>
      </table>
      <p className="flex justify-between border-t border-line px-3 py-2 text-xs text-muted">
        <span>{done} van {items.filter((i) => !i.fromStyling).length} ingepakt</span>
        <span aria-live="polite">{status}</span>
      </p>
    </div>
  );
}

// Groepsfoto's -------------------------------------------------------------------------------------

export interface PhotoData {
  id: string;
  who: string;
  location: string;
  done: boolean;
}

export function GroupPhotos({ coupleId, photos, isAdmin }: { coupleId: string; photos: PhotoData[]; isAdmin: boolean }) {
  const [list, setList] = useState(photos);
  const [status, setStatus] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const [, start] = useTransition();
  const done = list.filter((p) => p.done).length;

  const move = (id: string, to: number) => {
    const from = list.findIndex((p) => p.id === id);
    if (from === -1 || to < 0 || to >= list.length || to === from) return;
    const next = [...list];
    const [p] = next.splice(from, 1);
    next.splice(to, 0, p);
    setList(next);
    start(async () => saved(setStatus)(await moveGroupPhoto(coupleId, id, to)));
  };

  return (
    <div className="card">
      <p className="flex items-center justify-between border-b border-line px-4 py-2 text-sm">
        <strong>{done} van {list.length} gemaakt</strong>
        <span className="text-xs text-muted" aria-live="polite">{status}</span>
      </p>
      <ol>
        {list.map((p, i) => (
          <li
            key={p.id}
            onDragOver={(e) => drag && e.preventDefault()}
            onDrop={() => { if (drag) move(drag, i); setDrag(null); }}
            className={`grid grid-cols-[auto_1fr_auto] items-start gap-2 border-t border-line px-3 py-2 first:border-t-0 sm:grid-cols-[auto_2rem_1.6fr_1fr_auto_auto] ${p.done ? "bg-success-soft/40" : ""}`}
          >
            <span className="flex flex-col items-center">
              <span draggable onDragStart={() => setDrag(p.id)} className="hidden cursor-grab text-muted sm:inline" aria-hidden="true" title="Slepen">⋮⋮</span>
              <button type="button" disabled={i === 0} onClick={() => move(p.id, i - 1)} className="text-xs text-muted disabled:opacity-25" aria-label="Omhoog">↑</button>
              <button type="button" disabled={i === list.length - 1} onClick={() => move(p.id, i + 1)} className="text-xs text-muted disabled:opacity-25" aria-label="Omlaag">↓</button>
            </span>
            <span className="hidden pt-1.5 text-sm text-muted sm:block">{i + 1}.</span>
            <input
              defaultValue={p.who}
              aria-label="Wie staan erop"
              onBlur={(e) => e.target.value !== e.target.defaultValue && start(async () => saved(setStatus)(await updateGroupPhoto(coupleId, p.id, { who: e.target.value })))}
              className="input py-1.5 text-sm"
            />
            <input
              defaultValue={p.location}
              placeholder="Locatie"
              aria-label="Locatie"
              onBlur={(e) => e.target.value !== e.target.defaultValue && start(async () => saved(setStatus)(await updateGroupPhoto(coupleId, p.id, { location: e.target.value })))}
              className="input col-start-2 py-1.5 text-sm sm:col-start-auto"
            />
            <label className="flex items-center gap-1.5 pt-1.5 text-xs text-muted" title={isAdmin ? undefined : "Sabine vinkt dit aan op de dag"}>
              <input
                type="checkbox"
                checked={p.done}
                disabled={!isAdmin}
                onChange={(e) => {
                  setList((l) => l.map((x) => (x.id === p.id ? { ...x, done: e.target.checked } : x)));
                  start(async () => saved(setStatus)(await updateGroupPhoto(coupleId, p.id, { done: e.target.checked })));
                }}
                className="h-4 w-4 accent-[#6B1E2E]"
              />
              Gemaakt
            </label>
            <form action={deleteGroupPhoto} onSubmit={(e) => { if (!confirm("Deze foto verwijderen?")) e.preventDefault(); }} className="pt-1">
              <input type="hidden" name="coupleId" value={coupleId} />
              <input type="hidden" name="photoId" value={p.id} />
              <button type="submit" className="text-muted hover:text-bordeaux" aria-label="Foto verwijderen">×</button>
            </form>
          </li>
        ))}
        {list.length === 0 && <li className="px-4 py-4 text-sm text-muted">Nog geen groepsfoto&apos;s.</li>}
      </ol>
    </div>
  );
}

// Gastenlijst op de dag ------------------------------------------------------------------------------

export interface DayGuest {
  id: string;
  response_id: string | null;
  group: string;
  first_name: string;
  last_name: string;
  relation: string;
  relation_note: string;
  phone: string;
  diet: string;
  partial_note: string;
  attendance: string;
  is_kid: boolean;
  important: boolean;
  checked_in: boolean;
}

export function DayGuestList({ coupleId, guests, groups, isAdmin }: { coupleId: string; guests: DayGuest[]; groups: string[]; isAdmin: boolean }) {
  const [list, setList] = useState(guests);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [, start] = useTransition();
  const q = search.trim().toLowerCase();
  const shown = useMemo(
    () => (q ? list.filter((g) => `${g.first_name} ${g.last_name} ${g.relation} ${g.relation_note}`.toLowerCase().includes(q)) : list),
    [list, q],
  );
  const inside = list.filter((g) => g.checked_in).length;
  const change = (id: string, patch: Partial<DayGuest>, server: Parameters<typeof updateDayGuest>[2]) => {
    setList((l) => l.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    start(async () => saved(setStatus)(await updateDayGuest(coupleId, id, server)));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Zoek een gast…" aria-label="Zoek een gast" className="input max-w-xs" />
        <strong className="text-sm">{inside} van {list.length} binnen</strong>
        <span className="text-xs text-muted" aria-live="polite">{status}</span>
      </div>
      {groups.map((group) => {
        const rows = shown.filter((g) => g.group === group);
        const all = list.filter((g) => g.group === group);
        if (all.length === 0) return null;
        let shade = false;
        let last: string | null = null;
        let nr = 0;
        return (
          <section key={group}>
            <h3 className="mb-2 font-serif text-lg font-semibold">
              {group} <span className="font-sans text-sm font-normal text-muted">{all.length} aanwezig, waarvan {all.filter((g) => g.is_kid).length} {all.filter((g) => g.is_kid).length === 1 ? "kind" : "kinderen"}</span>
            </h3>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="table-head">
                  <tr><th className="px-2 py-2">Nr.</th><th className="px-2 py-2">Aanwezig</th><th className="px-2 py-2">Naam</th><th className="px-2 py-2">Relatie</th><th className="px-2 py-2">Mobiel</th><th className="px-2 py-2">Allergieën / dieet</th><th className="px-2 py-2">Deel van de dag</th></tr>
                </thead>
                <tbody>
                  {rows.map((g) => {
                    const key = g.response_id ?? g.id;
                    if (key !== last) shade = !shade;
                    last = key;
                    nr++;
                    return (
                      <tr key={g.id} className={`border-t border-line align-top ${shade ? "bg-cream/60" : ""}`}>
                        <td className="px-2 py-1.5 text-muted">{nr}</td>
                        <td className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={g.checked_in}
                            disabled={!isAdmin}
                            title={isAdmin ? undefined : "Sabine vinkt dit aan op de dag"}
                            aria-label={`${g.first_name} aanwezig`}
                            onChange={(e) => change(g.id, { checked_in: e.target.checked }, { checkedIn: e.target.checked })}
                            className="h-4 w-4 accent-[#6B1E2E]"
                          />
                        </td>
                        <td className={`px-2 py-1.5 ${g.important ? "font-semibold" : ""}`}>
                          <button type="button" onClick={() => change(g.id, { important: !g.important }, { important: !g.important })} aria-label={g.important ? "Niet meer belangrijk" : "Markeer als belangrijk"} className={g.important ? "text-gold" : "text-line hover:text-gold"}>
                            ★
                          </button>{" "}
                          {g.first_name} {g.last_name}
                          {g.is_kid && <span className="ml-1 rounded-full bg-gold-soft px-1.5 text-xs font-normal text-gold-ink">kind</span>}
                        </td>
                        <td className={`px-2 py-1.5 ${g.important ? "font-semibold" : ""}`}>
                          <input
                            defaultValue={g.relation_note || g.relation}
                            aria-label="Relatie (verfijnen)"
                            title={g.relation_note ? `Ingevuld bij RSVP: ${g.relation}` : "Verfijnen, bijvoorbeeld: Zus Estelle"}
                            onBlur={(e) => e.target.value !== e.target.defaultValue && change(g.id, { relation_note: e.target.value }, { relationNote: e.target.value === g.relation ? "" : e.target.value })}
                            className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-line focus:border-line focus:bg-white"
                          />
                        </td>
                        <td className="px-2 py-1.5">{g.phone ? <a href={`tel:${g.phone.replace(/\s/g, "")}`} className="text-bordeaux">{g.phone}</a> : ""}</td>
                        <td className="px-2 py-1.5">{g.diet}</td>
                        <td className="px-2 py-1.5">{g.attendance === "partial" ? g.partial_note || "Ja" : ""}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-3 text-center text-muted">Geen gasten gevonden.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      {list.length === 0 && <p className="card p-5 text-sm text-muted">Zodra gasten zich via de RSVP aanmelden, staan ze hier.</p>}
    </div>
  );
}
