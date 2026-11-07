"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addTable, moveSeat, placeBlock, setSeat, updateTable } from "@/app/actions/ws-seating";
import { matchSeatName } from "@/lib/ws/pure";
import { CANVAS, ceremonyFront, ceremonySeats, SEAT, tableSeats, tableSize, type SeatSpot } from "@/lib/ws/seating-geometry";
import type { SeatingState } from "@/lib/ws/seating";

type Drag = { kind: "guest" | "seat" | "block"; id: string };
type Occupant = { label: string; state: "guest" | "declined" | "maybe" | "unknown"; guestId?: string; candidate?: string; partial: string };
const TYPE = "application/x-opstelling";

/**
 * A seating plan: every chair is a box with a name. Guests from the chosen
 * groups are dragged (or chosen) onto chairs; names can also be typed for
 * people who have not filled in the RSVP. Sabine also places and shapes the
 * tables. Works with a mouse and on a phone (tap a chair, then pick a guest).
 */
export function SeatingEditor({ coupleId, initial, isAdmin, readOnly = false }: { coupleId: string; initial: SeatingState; isAdmin: boolean; readOnly?: boolean }) {
  const [state, setState] = useState(initial);
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [scale, setScale] = useState(1);
  const [, start] = useTransition();
  const outer = useRef<HTMLDivElement>(null);
  const { layout } = state;
  const dinner = layout.kind === "dinner";

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / CANVAS.w);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const run = (p: Promise<{ ok: true; state: SeatingState } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await p;
      if (r.ok) {
        setState(r.state);
        setError("");
      } else setError(r.error);
    });

  // Every chair on the plan.
  const spots: (SeatSpot & { table?: string })[] = useMemo(
    () => (dinner ? state.tables.flatMap((t) => tableSeats(t).map((s) => ({ ...s, table: t.id }))) : ceremonySeats(layout)),
    [dinner, state.tables, layout],
  );
  const seatOf = useMemo(() => new Map(state.seats.map((s) => [s.seat_key, s])), [state.seats]);
  const guests = useMemo(() => new Map(state.candidates.map((g) => [g.id, g])), [state.candidates]);
  const everyone = state.everyone;

  // Who sits where: a guest id, or a typed name (that may turn out to be a guest).
  const occupant = (key: string): Occupant | null => {
    const s = seatOf.get(key);
    if (!s) return null;
    if (s.guest_id) {
      const g = guests.get(s.guest_id) ?? everyone.find((e) => e.id === s.guest_id);
      const declined = everyone.find((e) => e.id === s.guest_id && !e.attending);
      return { label: g?.name ?? "Gast", state: declined ? ("declined" as const) : ("guest" as const), guestId: s.guest_id, partial: guests.get(s.guest_id)?.partial ?? "" };
    }
    const m = matchSeatName(s.name, everyone);
    return { label: s.name, state: m.state, guestId: m.guestId, candidate: m.candidate, partial: m.guestId ? guests.get(m.guestId)?.partial ?? "" : "" };
  };
  const placedIds = new Set(spots.map((s) => occupant(s.key)).filter((o) => o && o.state === "guest" && o.guestId).map((o) => o!.guestId!));
  const unplaced = state.candidates.filter((g) => !placedIds.has(g.id) && (!search || g.name.toLowerCase().includes(search.toLowerCase())));
  const placedCount = state.candidates.filter((g) => placedIds.has(g.id)).length;
  const blocksPlaced = new Set(state.blocks.map((b) => b.styling_item_id));

  // Canvas coordinates from a pointer or drop position.
  const toCanvas = (clientX: number, clientY: number) => {
    const box = outer.current!.getBoundingClientRect();
    return { x: ((clientX - box.left) / scale / CANVAS.w) * 100, y: ((clientY - box.top) / scale / CANVAS.h) * 100 };
  };
  const drop = (e: React.DragEvent, seatKey?: string) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData(TYPE);
    if (!raw || readOnly) return;
    const d = JSON.parse(raw) as Drag;
    if (d.kind === "guest" && seatKey) run(setSeat(coupleId, layout.id, seatKey, { guestId: d.id }));
    if (d.kind === "seat" && seatKey) run(moveSeat(coupleId, layout.id, d.id, seatKey));
    if (d.kind === "block" && !seatKey) {
      const p = toCanvas(e.clientX, e.clientY);
      run(placeBlock(coupleId, layout.id, d.id, p.x, p.y));
    }
  };
  const dragData = (d: Drag) => (e: React.DragEvent) => {
    e.dataTransfer.setData(TYPE, JSON.stringify(d));
    e.dataTransfer.effectAllowed = "move";
  };

  // Moving tables and blocks with the pointer (Sabine for tables, both for blocks).
  const moving = useRef<{ kind: "table" | "block"; id: string; dx: number; dy: number } | null>(null);
  const [ghost, setGhost] = useState<{ id: string; x: number; y: number } | null>(null);
  const startMove = (kind: "table" | "block", id: string, x: number, y: number) => (e: React.PointerEvent) => {
    if (readOnly || (kind === "table" && !isAdmin)) return;
    const p = toCanvas(e.clientX, e.clientY);
    moving.current = { kind, id, dx: p.x - x, dy: p.y - y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.stopPropagation();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!moving.current) return;
    const p = toCanvas(e.clientX, e.clientY);
    setGhost({ id: moving.current.id, x: p.x - moving.current.dx, y: p.y - moving.current.dy });
  };
  const endMove = () => {
    const m = moving.current;
    moving.current = null;
    if (!m || !ghost || ghost.id !== m.id) return setGhost(null);
    if (m.kind === "table") {
      setState((s) => ({ ...s, tables: s.tables.map((t) => (t.id === m.id ? { ...t, x: ghost.x, y: ghost.y } : t)) }));
      run(updateTable(coupleId, m.id, { x: ghost.x, y: ghost.y }));
    } else {
      const block = state.blocks.find((b) => b.id === m.id);
      if (block) run(placeBlock(coupleId, layout.id, block.styling_item_id, ghost.x, ghost.y));
    }
    setGhost(null);
  };

  const seat = selectedSeat ? occupant(selectedSeat) : null;
  const table = state.tables.find((t) => t.id === selectedTable);
  const front = !dinner ? ceremonyFront(layout) : null;

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 text-sm">
        <strong>{placedCount} van {state.candidates.length} geplaatst</strong>
        <span className="flex flex-wrap items-center gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="h-3 w-5 rounded border border-line bg-white" /> Gast</span>
          <span className="flex items-center gap-1"><span className="h-3 w-5 rounded bg-[#fde6cf]" /> Nog niet aangemeld</span>
          <span className="flex items-center gap-1"><span className="h-3 w-5 rounded bg-[#f9d4d4]" /> Afgemeld</span>
          <span className="flex items-center gap-1"><span className="h-3 w-5 rotate-45 rounded-sm bg-[#d9e4cf]" /> Styling</span>
        </span>
      </div>
      {error && <p className="no-print text-sm text-red-700" role="alert">{error}</p>}

      <div className={`grid gap-4 ${readOnly ? "" : "lg:grid-cols-[1fr_16rem]"}`}>
        <div>
          {/* The floor plan: a 1000 x 650 canvas scaled to the width of the screen. */}
          <div
            ref={outer}
            className="relative w-full overflow-hidden rounded-2xl border border-line bg-[#fbf9f4]"
            style={{ height: CANVAS.h * scale }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => drop(e)}
            onPointerMove={onMove}
            onPointerUp={endMove}
            onClick={() => { setSelectedSeat(null); setSelectedTable(null); }}
          >
            <div className="absolute top-0 left-0 origin-top-left" style={{ width: CANVAS.w, height: CANVAS.h, transform: `scale(${scale})` }}>
              {front && (
                <div className="absolute flex items-center justify-center rounded-xl bg-bordeaux text-center text-sm font-medium text-white" style={{ left: front.x - front.w / 2, top: front.y - front.h / 2, width: front.w, height: front.h }}>
                  Bruidspaar & ceremonie
                </div>
              )}
              {!dinner && layout.shape === "rows" && (
                <>
                  {layout.side_left && <div className="absolute text-center text-xs font-semibold text-gold-ink" style={{ left: 40, top: 90, width: CANVAS.w / 2 - 100 }}>{layout.side_left}</div>}
                  {layout.side_right && <div className="absolute text-center text-xs font-semibold text-gold-ink" style={{ left: CANVAS.w / 2 + 60, top: 90, width: CANVAS.w / 2 - 100 }}>{layout.side_right}</div>}
                </>
              )}

              {dinner &&
                state.tables.map((t) => {
                  const pos = ghost?.id === t.id ? { ...t, x: ghost.x, y: ghost.y } : t;
                  const size = tableSize(t);
                  const [w, h] = t.rotation === 90 ? [size.h, size.w] : [size.w, size.h];
                  const taken = tableSeats(t).filter((s) => seatOf.has(s.key)).length;
                  return (
                    <div
                      key={t.id}
                      onPointerDown={startMove("table", t.id, t.x, t.y)}
                      onClick={(e) => { e.stopPropagation(); if (isAdmin && !readOnly) setSelectedTable(t.id); }}
                      className={`absolute flex flex-col items-center justify-center border-2 bg-[#efe7d6] text-center select-none ${t.shape === "round" ? "rounded-full" : "rounded-lg"} ${selectedTable === t.id ? "border-bordeaux" : "border-[#d8cbb0]"} ${isAdmin && !readOnly ? "cursor-move touch-none" : ""}`}
                      style={{ left: (pos.x / 100) * CANVAS.w - w / 2, top: (pos.y / 100) * CANVAS.h - h / 2, width: w, height: h }}
                    >
                      <span className="text-xs leading-tight font-semibold">{t.name}</span>
                      <span className="text-[10px] text-muted">{taken} van {t.seats}</span>
                    </div>
                  );
                })}

              {spots.map((s) => {
                const o = occupant(s.key);
                const moved = dinner && ghost && s.table === ghost.id ? state.tables.find((t) => t.id === ghost.id) : null;
                const shift = moved ? { dx: ((ghost!.x - moved.x) / 100) * CANVAS.w, dy: ((ghost!.y - moved.y) / 100) * CANVAS.h } : { dx: 0, dy: 0 };
                const tone = !o ? "border-dashed border-[#cdbf9f] bg-white/70 text-muted" : o.state === "guest" ? "border-line bg-white" : o.state === "declined" ? "border-[#e3a3a3] bg-[#f9d4d4]" : "border-[#efb98a] bg-[#fde6cf]";
                return (
                  <button
                    key={s.key}
                    type="button"
                    draggable={!readOnly && Boolean(o)}
                    onDragStart={dragData({ kind: "seat", id: s.key })}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.stopPropagation(); drop(e, s.key); }}
                    onClick={(e) => { e.stopPropagation(); if (!readOnly) { setSelectedSeat(s.key); setSelectedTable(null); } }}
                    title={o ? `${o.label}${o.state === "declined" ? " (afgemeld)" : o.state !== "guest" ? " (nog niet aangemeld)" : ""}${o.partial ? `, ${o.partial}` : ""}` : "Lege stoel"}
                    className={`absolute flex items-center justify-center overflow-hidden rounded-md border px-1 text-[12px] leading-none whitespace-nowrap ${tone} ${selectedSeat === s.key ? "ring-2 ring-bordeaux" : ""}`}
                    style={{ left: s.x + shift.dx - SEAT.w / 2, top: s.y + shift.dy - SEAT.h / 2, width: SEAT.w, height: SEAT.h }}
                  >
                    {o ? <span className="truncate">{o.label}{o.partial ? " ◐" : ""}</span> : "+"}
                  </button>
                );
              })}

              {state.blocks.map((b) => {
                const pos = ghost?.id === b.id ? ghost : b;
                return (
                  <div
                    key={b.id}
                    onPointerDown={startMove("block", b.id, b.x, b.y)}
                    className={`absolute flex max-w-36 items-center gap-1 rounded-md border border-[#a9bf98] bg-[#d9e4cf] px-2 py-1 text-[10px] leading-tight select-none ${readOnly ? "" : "cursor-move touch-none"}`}
                    style={{ left: (pos.x / 100) * CANVAS.w, top: (pos.y / 100) * CANVAS.h, transform: "translate(-50%, -50%)" }}
                  >
                    <span aria-hidden="true">◆</span>
                    <span className="line-clamp-2">{b.what}</span>
                    {!readOnly && (
                      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => run(placeBlock(coupleId, layout.id, b.styling_item_id, 0, 0, true))} className="ml-1 text-muted" aria-label={`${b.what} van de plattegrond halen`}>×</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {!readOnly && seat !== undefined && selectedSeat && (
            <SeatPanel
              key={selectedSeat}
              occupant={seat}
              candidates={unplaced}
              dinner={dinner}
              onPick={(guestId) => { run(setSeat(coupleId, layout.id, selectedSeat, { guestId })); setSelectedSeat(null); }}
              onName={(name) => { run(setSeat(coupleId, layout.id, selectedSeat, { name })); setSelectedSeat(null); }}
              onClear={() => { run(setSeat(coupleId, layout.id, selectedSeat, {})); setSelectedSeat(null); }}
              onClose={() => setSelectedSeat(null)}
            />
          )}

          {!readOnly && isAdmin && dinner && (
            <div className="no-print mt-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => run(addTable(coupleId, layout.id, "round"))} className="btn-secondary py-1.5 text-xs">+ Ronde tafel</button>
                <button type="button" onClick={() => run(addTable(coupleId, layout.id, "square"))} className="btn-secondary py-1.5 text-xs">+ Vierkante tafel</button>
                <button type="button" onClick={() => run(addTable(coupleId, layout.id, "long"))} className="btn-secondary py-1.5 text-xs">+ Lange tafel</button>
              </div>
              {table && <TablePanel key={table.id} table={table} onChange={(c) => run(updateTable(coupleId, table.id, c))} onDone={() => setSelectedTable(null)} />}
            </div>
          )}
        </div>

        {!readOnly && (
          <aside className="no-print space-y-4">
            <div className="card p-3">
              <h3 className="font-serif text-base font-semibold">Te plaatsen ({unplaced.length})</h3>
              <p className="mb-2 text-xs text-muted">Sleep een gast naar een stoel, of tik op een stoel en kies.</p>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Zoeken…" aria-label="Zoek een gast" className="input mb-2 py-1 text-sm" />
              <ul className="max-h-96 space-y-1 overflow-y-auto">
                {unplaced.map((g) => (
                  <li
                    key={g.id}
                    draggable
                    onDragStart={dragData({ kind: "guest", id: g.id })}
                    className="cursor-grab rounded-lg bg-cream px-2 py-1 text-sm"
                  >
                    {g.name}
                    <span className="block text-[11px] text-muted">
                      {[g.relation, dinner && g.diet ? `dieet: ${g.diet}` : "", g.partial ? `deel van de dag: ${g.partial}` : ""].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
                {unplaced.length === 0 && <li className="text-xs text-muted">{state.candidates.length ? "Iedereen heeft een plek." : "Nog geen aanmeldingen in de gekozen gastengroepen."}</li>}
              </ul>
            </div>
            {state.styling.length > 0 && (
              <div className="card p-3">
                <h3 className="font-serif text-base font-semibold">Styling</h3>
                <p className="mb-2 text-xs text-muted">Uit het stylingplan ({dinner ? "Diner" : "Ceremoniezaal"}). Sleep naar de plattegrond.</p>
                <ul className="space-y-1">
                  {state.styling.filter((s) => !blocksPlaced.has(s.id)).map((s) => (
                    <li key={s.id} draggable onDragStart={dragData({ kind: "block", id: s.id })} className="cursor-grab rounded-md border border-[#a9bf98] bg-[#d9e4cf] px-2 py-1 text-xs">◆ {s.what}</li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function SeatPanel({
  occupant,
  candidates,
  dinner,
  onPick,
  onName,
  onClear,
  onClose,
}: {
  occupant: Occupant | null;
  candidates: SeatingState["candidates"];
  dinner: boolean;
  onPick: (guestId: string) => void;
  onName: (name: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const o = occupant;
  const [name, setName] = useState(o && o.state !== "guest" ? o.label : "");
  return (
    <div className="no-print mt-3 space-y-2 rounded-2xl border border-bordeaux/30 bg-white p-4 text-sm shadow-sm">
      <div className="flex items-center justify-between">
        <strong>{o ? o.label : "Lege stoel"}</strong>
        <button type="button" onClick={onClose} className="text-muted" aria-label="Sluiten">×</button>
      </div>
      {o?.state === "declined" && <p className="text-xs text-red-800">Afgemeld voor de bruiloft.</p>}
      {o && (o.state === "unknown" || o.state === "maybe") && <p className="text-xs text-[#8a4b1c]">Nog niet aangemeld via de RSVP.</p>}
      {o?.state === "maybe" && o.guestId && (
        <button type="button" onClick={() => onPick(o.guestId!)} className="btn-secondary py-1 text-xs">Is dit dezelfde persoon als {o.candidate}? Ja, koppelen</button>
      )}
      <label className="block">
        <span className="label">Gast kiezen</span>
        <select defaultValue="" onChange={(e) => e.target.value && onPick(e.target.value)} className="input py-1.5">
          <option value="">Kies uit &quot;Te plaatsen&quot;…</option>
          {candidates.map((g) => (
            <option key={g.id} value={g.id}>{g.name}{g.relation ? ` (${g.relation})` : ""}{dinner && g.diet ? `, ${g.diet}` : ""}</option>
          ))}
        </select>
      </label>
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) onName(name.trim()); }} className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Of typ een naam (bijvoorbeeld ouders vooraan)" aria-label="Naam typen" className="input flex-1 py-1.5" />
        <button type="submit" className="btn-secondary py-1.5 text-xs">Plaatsen</button>
      </form>
      {o && <button type="button" onClick={onClear} className="text-xs text-muted hover:text-bordeaux">Stoel leegmaken</button>}
    </div>
  );
}

function TablePanel({
  table,
  onChange,
  onDone,
}: {
  table: SeatingState["tables"][number];
  onChange: (c: Parameters<typeof updateTable>[2]) => void;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-white p-3 text-sm">
      <label className="text-xs">Naam<input defaultValue={table.name} onBlur={(e) => e.target.value !== table.name && onChange({ name: e.target.value })} className="input mt-0.5 w-32 py-1" /></label>
      <label className="text-xs">Stoelen<input type="number" min={1} max={60} defaultValue={table.seats} onBlur={(e) => Number(e.target.value) !== table.seats && onChange({ seats: Number(e.target.value) })} className="input mt-0.5 w-20 py-1" /></label>
      {table.shape === "long" && (
        <>
          <label className="text-xs">Zijden
            <select defaultValue={table.long_sides} onChange={(e) => onChange({ long_sides: e.target.value })} className="input mt-0.5 py-1">
              <option value="both">Beide kanten</option>
              <option value="one">Eén kant</option>
            </select>
          </label>
          <label className="flex items-center gap-1 pb-1.5 text-xs"><input type="checkbox" defaultChecked={table.head_seats} onChange={(e) => onChange({ head_seats: e.target.checked })} className="accent-[#6B1E2E]" /> Kopse kanten</label>
        </>
      )}
      {table.shape !== "round" && <button type="button" onClick={() => onChange({ rotation: table.rotation === 90 ? 0 : 90 })} className="btn-ghost py-1 text-xs">Draaien</button>}
      <button type="button" onClick={() => onChange({ duplicate: true })} className="btn-ghost py-1 text-xs">Dupliceren</button>
      <button type="button" onClick={() => { if (confirm(`${table.name} verwijderen?`)) { onChange({ remove: true }); onDone(); } }} className="btn-ghost py-1 text-xs text-bordeaux">Verwijderen</button>
      <button type="button" onClick={onDone} className="ml-auto text-xs text-muted">Klaar</button>
    </div>
  );
}
