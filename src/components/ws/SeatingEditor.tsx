"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addObject, addTable, moveItem, placeBlock, setSeat, updateObject, updateRows, updateTable } from "@/app/actions/ws-seating";
import { matchSeatName } from "@/lib/ws/pure";
import { CANVAS, ceremonyFront, ceremonyRows, ceremonySeats, evenRows, MAX_ROWS, MAX_SIDE, rowChange, SEAT, tableSeats, tableSize, type RowSeats, type SeatSpot } from "@/lib/ws/seating-geometry";
import { applyMove, moveMessage, OBJECT_KINDS, objectLabel, planMove, type MoveSource, type MoveTarget, type ObjectKind } from "@/lib/ws/seating-moves";
import type { SeatingState } from "@/lib/ws/seating";

type ListDrag = { kind: "guest" | "block"; id: string };
type Block = SeatingState["blocks"][number];
type Occupant =
  | { type: "person"; label: string; state: "guest" | "declined" | "maybe" | "unknown"; guestId?: string; candidate?: string; partial: string }
  | { type: "object"; label: string; block: Block };
type Result = { ok: true; state: SeatingState } | { ok: false; error: string };
const TYPE = "application/x-opstelling";

/** Pointer drags on the plan: whatever is on a chair, an object, or a table (Sabine). */
type PointerDrag = { src: { seat: string } | { object: string } | { table: string }; x0: number; y0: number; dx: number; dy: number; active: boolean };

const isCeremonyElement = (kind: ObjectKind) => kind !== "styling";
const objectTone = (kind: ObjectKind) => (isCeremonyElement(kind) ? "border-gold bg-gold text-white" : "border-[#a9bf98] bg-[#d9e4cf] text-ink");
const objectIcon = (kind: ObjectKind) => (kind === "music" ? "♪" : isCeremonyElement(kind) ? "✦" : "◆");

/**
 * A seating plan: every chair is a box with a name. Guests from the chosen
 * groups are dragged (or chosen) onto chairs; names can also be typed for
 * people who have not filled in the RSVP. Guests and objects (styling,
 * ceremony elements) are moved or swapped by dragging (mouse or finger) or by
 * clicking one place and then another; Escape cancels. Sabine also places and
 * shapes the tables and the ceremony rows.
 */
export function SeatingEditor({ coupleId, initial, canEditLayout, readOnly = false }: { coupleId: string; initial: SeatingState; canEditLayout: boolean; readOnly?: boolean }) {
  const [state, setState] = useState(initial);
  const [picked, setPicked] = useState<MoveSource | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [fitScale, setFitScale] = useState(1);
  // Feedback Sabine (14): zoom in and out on the plan; 1 = the whole plan fits the width.
  const [zoom, setZoom] = useState(1);
  const scale = fitScale * zoom;
  const [, start] = useTransition();
  const outer = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const { layout } = state;
  const dinner = layout.kind === "dinner";
  const aisle = !dinner && layout.shape === "rows";

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const fit = () => setFitScale(el.clientWidth / CANVAS.w);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Escape: no place selected any more.
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPicked(null);
        setSelectedTable(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const run = (p: Promise<Result>) =>
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
  const spotOf = useMemo(() => new Map(spots.map((s) => [s.key, s])), [spots]);
  const seatOf = useMemo(() => new Map(state.seats.map((s) => [s.seat_key, s])), [state.seats]);
  const blockOf = useMemo(() => new Map(state.blocks.map((b) => [b.id, b])), [state.blocks]);
  const chairOfObject = useMemo(() => new Map(state.seats.filter((s) => s.object_id).map((s) => [s.object_id!, s.seat_key])), [state.seats]);
  const guests = useMemo(() => new Map(state.candidates.map((g) => [g.id, g])), [state.candidates]);
  const everyone = state.everyone;

  // Who or what is on a chair: a guest id, a typed name (that may turn out to be a guest), or an object.
  const occupant = (key: string): Occupant | null => {
    const s = seatOf.get(key);
    if (!s) return null;
    if (s.object_id) {
      const block = blockOf.get(s.object_id);
      return block ? { type: "object", label: objectLabel(block.kind, block.what), block } : null;
    }
    if (s.guest_id) {
      const g = guests.get(s.guest_id) ?? everyone.find((e) => e.id === s.guest_id);
      const declined = everyone.find((e) => e.id === s.guest_id && !e.attending);
      return { type: "person", label: g?.name ?? "Gast", state: declined ? "declined" : "guest", guestId: s.guest_id, partial: guests.get(s.guest_id)?.partial ?? "" };
    }
    const m = matchSeatName(s.name, everyone);
    return { type: "person", label: s.name, state: m.state, guestId: m.guestId, candidate: m.candidate, partial: m.guestId ? guests.get(m.guestId)?.partial ?? "" : "" };
  };
  const placedIds = new Set(
    spots
      .map((s) => occupant(s.key))
      .flatMap((o) => (o && o.type === "person" && o.state === "guest" && o.guestId ? [o.guestId] : [])),
  );
  const unplaced = state.candidates.filter((g) => !placedIds.has(g.id) && (!search || g.name.toLowerCase().includes(search.toLowerCase())));
  const placedCount = state.candidates.filter((g) => placedIds.has(g.id)).length;
  const blocksPlaced = new Set(state.blocks.map((b) => b.styling_item_id));
  const loose = state.blocks.filter((b) => !chairOfObject.has(b.id));

  const labelOf = (who: MoveSource): string => {
    if ("seat" in who) return occupant(who.seat)?.label ?? "Lege plek";
    const b = blockOf.get(who.object);
    return b ? objectLabel(b.kind, b.what) : "Object";
  };
  const occupied = (p: MoveSource) => ("seat" in p ? seatOf.has(p.seat) : blockOf.has(p.object));
  const same = (a: MoveSource | null, b: MoveSource) => !!a && (("seat" in a && "seat" in b && a.seat === b.seat) || ("object" in a && "object" in b && a.object === b.object));

  /** Move or swap at once on screen, then save. */
  const doMove = (from: MoveSource, to: MoveTarget) => {
    const plan = planMove(state.seats, state.blocks, from, to);
    if (plan.kind === "none") {
      if (plan.reason) setError(plan.reason);
      return;
    }
    const message = moveMessage(plan.kind, labelOf(plan.a), plan.b ? labelOf(plan.b) : undefined);
    const next = applyMove(state.seats, state.blocks, plan.ops);
    setState((s) => ({ ...s, seats: next.chairs, blocks: s.blocks.map((b) => ({ ...b, ...pick(next.objects.find((o) => o.id === b.id)) })) }));
    setToast(message);
    setError("");
    run(moveItem(coupleId, layout.id, from, to));
  };

  // Canvas coordinates (percent) from a pointer or drop position.
  const toCanvas = (clientX: number, clientY: number) => {
    // The sheet itself, so a zoomed plan that is scrolled still maps right.
    const box = (sheet.current ?? outer.current!).getBoundingClientRect();
    return { x: ((clientX - box.left) / scale / CANVAS.w) * 100, y: ((clientY - box.top) / scale / CANVAS.h) * 100 };
  };
  const seatPct = (key: string) => {
    const s = spotOf.get(key);
    return s ? { x: (s.x / CANVAS.w) * 100, y: (s.y / CANVAS.h) * 100 } : { x: 50, y: 50 };
  };

  // Guests and styling from the list on the right (mouse).
  const drop = (e: React.DragEvent, seatKey?: string) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData(TYPE);
    if (!raw || readOnly) return;
    const d = JSON.parse(raw) as ListDrag;
    if (d.kind === "guest" && seatKey) run(setSeat(coupleId, layout.id, seatKey, { guestId: d.id }));
    if (d.kind === "block") {
      const p = toCanvas(e.clientX, e.clientY);
      run(placeBlock(coupleId, layout.id, d.id, p.x, p.y));
    }
  };
  const dragData = (d: ListDrag) => (e: React.DragEvent) => {
    e.dataTransfer.setData(TYPE, JSON.stringify(d));
    e.dataTransfer.effectAllowed = "move";
  };

  // Dragging on the plan with a mouse or a finger.
  const drag = useRef<PointerDrag | null>(null);
  const justDragged = useRef(false);
  const [ghost, setGhost] = useState<{ src: PointerDrag["src"]; x: number; y: number } | null>(null);
  const startDrag = (src: PointerDrag["src"], at?: { x: number; y: number }) => (e: React.PointerEvent) => {
    if (readOnly || e.button > 0) return;
    if ("table" in src && !canEditLayout) return;
    const p = toCanvas(e.clientX, e.clientY);
    drag.current = { src, x0: e.clientX, y0: e.clientY, dx: at ? p.x - at.x : 0, dy: at ? p.y - at.y : 0, active: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.stopPropagation();
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.active && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
    d.active = true;
    const p = toCanvas(e.clientX, e.clientY);
    setGhost({ src: d.src, x: p.x - d.dx, y: p.y - d.dy });
  };
  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.active || !ghost) return setGhost(null);
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 0);
    setGhost(null);
    if ("table" in d.src) {
      const id = d.src.table;
      setState((s) => ({ ...s, tables: s.tables.map((t) => (t.id === id ? { ...t, x: ghost.x, y: ghost.y } : t)) }));
      run(updateTable(coupleId, id, { x: ghost.x, y: ghost.y }));
      return;
    }
    // What is under the finger: a chair, an object, or the floor.
    const under = document.elementsFromPoint(e.clientX, e.clientY);
    const seatEl = under.find((el) => el instanceof HTMLElement && el.dataset.seat) as HTMLElement | undefined;
    const objectEl = under.find((el) => el instanceof HTMLElement && el.dataset.object && !("object" in d.src && el.dataset.object === d.src.object)) as HTMLElement | undefined;
    const inside = under.includes(outer.current!);
    const to: MoveTarget | null = seatEl ? { seat: seatEl.dataset.seat! } : objectEl ? { object: objectEl.dataset.object! } : inside ? { point: { x: ghost.x, y: ghost.y } } : null;
    setPicked(null);
    // A guest let go next to the chairs simply stays where they were.
    if (!to || ("point" in to && "seat" in d.src && occupant(d.src.seat)?.type !== "object")) return;
    doMove(d.src, to);
  };
  const cancelDrag = () => {
    drag.current = null;
    setGhost(null);
  };

  // Clicking: first place, then the second place = move or swap.
  const clickPlace = (place: MoveSource) => {
    if (readOnly || justDragged.current) return;
    setSelectedTable(null);
    if (same(picked, place)) return setPicked(null);
    if (picked && occupied(picked)) {
      setPicked(null);
      doMove(picked, place);
      return;
    }
    setPicked(place);
  };

  const pickedSeat = picked && "seat" in picked ? picked.seat : null;
  const pickedObject = picked && "object" in picked ? blockOf.get(picked.object) ?? null : null;
  const seatOccupant = pickedSeat ? occupant(pickedSeat) : null;
  const table = state.tables.find((t) => t.id === selectedTable);
  const front = !dinner ? ceremonyFront(layout) : null;
  const ghostLabel = ghost && "seat" in ghost.src ? occupant(ghost.src.seat) : null;

  // Rows of a ceremony with an aisle (Sabine): changes are saved at once, with a warning for taken chairs.
  const rows = aisle ? ceremonyRows(layout) : [];
  const changeRows = (next: RowSeats[], removed?: number) => {
    const { lost } = rowChange(rows, next, state.seats.map((s) => s.seat_key), removed);
    const visible = lost.filter((k) => spotOf.has(k)).map((k) => occupant(k)).filter(Boolean) as Occupant[];
    if (visible.length) {
      const people = visible.filter((o) => o.type === "person").map((o) => o.label);
      const things = visible.filter((o) => o.type === "object").map((o) => o.label);
      const text = [
        `Op ${visible.length === 1 ? "de stoel die je weghaalt zit" : "de stoelen die je weghaalt zitten"}: ${visible.map((o) => o.label).join(", ")}.`,
        people.length ? `${people.length === 1 ? "Deze gast gaat" : "Deze gasten gaan"} terug naar "nog niet geplaatst".` : "",
        things.length ? `${things.length === 1 ? "Het object blijft" : "De objecten blijven"} los op de plattegrond staan.` : "",
        "Doorgaan?",
      ].filter(Boolean).join("\n");
      if (!confirm(text)) return;
    }
    if (removed === undefined) setState((s) => ({ ...s, layout: { ...s.layout, row_seats: next, rows: next.length } }));
    run(updateRows(coupleId, layout.id, next, removed));
  };

  const renderObject = (b: Block, onChair: boolean) => (
    <>
      <span aria-hidden="true">{objectIcon(b.kind)}</span>
      <span className={onChair ? "truncate" : "line-clamp-2"}>{objectLabel(b.kind, b.what)}</span>
    </>
  );

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 text-sm">
        <strong>{placedCount} van {state.candidates.length} geplaatst</strong>
        <span className="flex flex-wrap items-center gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="h-3 w-5 rounded border border-line bg-white" /> Gast</span>
          <span className="flex items-center gap-1"><span className="h-3 w-5 rounded bg-[#fde6cf]" /> Nog niet aangemeld</span>
          <span className="flex items-center gap-1"><span className="h-3 w-5 rounded bg-[#f9d4d4]" /> Afgemeld</span>
          <span className="flex items-center gap-1"><span className="h-3 w-5 rotate-45 rounded-sm bg-[#d9e4cf]" /> Styling</span>
          {!dinner && <span className="flex items-center gap-1"><span className="h-3 w-5 rounded bg-gold" /> Ceremonie-element</span>}
        </span>
      </div>
      {error && <p className="no-print text-sm text-red-700" role="alert">{error}</p>}

      <div className={`grid gap-4 ${readOnly ? "" : "lg:grid-cols-[minmax(0,1fr)_16rem]"}`}>
        {/* min-w-0: a zoomed plan scrolls inside its box instead of widening the page. */}
        <div className="min-w-0">
          {!readOnly && <p className="no-print mb-1.5 text-xs text-muted">Sleep een gast of object naar een andere plek, of tik op een plek en daarna op de nieuwe plek. Op een bezette plek wisselen ze. Esc heft de selectie op.</p>}
          {!readOnly && (
            <div className="no-print mb-1.5 flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label="Zoomen">
              <button type="button" onClick={() => setZoom((z) => zoomStep(z, -1))} disabled={zoom <= ZOOM.min} className="btn-secondary px-2.5 py-1 text-xs" aria-label="Uitzoomen">−</button>
              <span className="w-12 text-center tabular-nums text-muted" aria-live="polite">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((z) => zoomStep(z, 1))} disabled={zoom >= ZOOM.max} className="btn-secondary px-2.5 py-1 text-xs" aria-label="Inzoomen">+</button>
              {zoom !== 1 && <button type="button" onClick={() => setZoom(1)} className="btn-ghost px-2 py-1 text-xs">Passend maken</button>}
              <span className="text-muted">Ingezoomd scroll je over de plattegrond; Ctrl of ⌘ met het muiswiel zoomt ook.</span>
            </div>
          )}
          {/* The floor plan: a 1000 x 650 canvas scaled to the width of the screen, times the zoom. */}
          <div
            ref={outer}
            className={`relative w-full rounded-2xl border border-line bg-[#fbf9f4] ${zoom > 1 ? "overflow-auto" : "overflow-hidden"}`}
            style={{ height: CANVAS.h * scale, maxHeight: zoom > 1 ? "75vh" : undefined }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => drop(e)}
            onPointerMove={onMove}
            onPointerUp={endDrag}
            onPointerCancel={cancelDrag}
            onWheel={(e) => {
              if (readOnly || !(e.ctrlKey || e.metaKey)) return;
              e.preventDefault();
              setZoom((z) => zoomStep(z, e.deltaY < 0 ? 1 : -1));
            }}
            onClick={() => { if (!justDragged.current) { setPicked(null); setSelectedTable(null); } }}
          >
            <div ref={sheet} className={`relative ${zoom < 1 ? "mx-auto" : ""}`} style={{ width: CANVAS.w * scale, height: CANVAS.h * scale }}>
            <div className="absolute top-0 left-0 origin-top-left" style={{ width: CANVAS.w, height: CANVAS.h, transform: `scale(${scale})` }}>
              {front && (
                <div className="absolute flex items-center justify-center rounded-xl bg-bordeaux text-center text-sm font-medium text-white" style={{ left: front.x - front.w / 2, top: front.y - front.h / 2, width: front.w, height: front.h }}>
                  Bruidspaar & ceremonie
                </div>
              )}
              {aisle && (
                <>
                  {layout.side_left && <div className="absolute text-center text-xs font-semibold text-gold-ink" style={{ left: 40, top: 90, width: CANVAS.w / 2 - 100 }}>{layout.side_left}</div>}
                  {layout.side_right && <div className="absolute text-center text-xs font-semibold text-gold-ink" style={{ left: CANVAS.w / 2 + 60, top: 90, width: CANVAS.w / 2 - 100 }}>{layout.side_right}</div>}
                </>
              )}

              {dinner &&
                state.tables.map((t) => {
                  const moving = ghost && "table" in ghost.src && ghost.src.table === t.id;
                  const pos = moving ? { x: ghost.x, y: ghost.y } : t;
                  const size = tableSize(t);
                  const [w, h] = t.rotation === 90 ? [size.h, size.w] : [size.w, size.h];
                  const taken = tableSeats(t).filter((s) => seatOf.has(s.key)).length;
                  return (
                    <div
                      key={t.id}
                      onPointerDown={startDrag({ table: t.id }, t)}
                      onClick={(e) => { e.stopPropagation(); if (canEditLayout && !readOnly && !justDragged.current) { setSelectedTable(t.id); setPicked(null); } }}
                      className={`absolute flex flex-col items-center justify-center border-2 bg-[#efe7d6] text-center select-none ${t.shape === "round" ? "rounded-full" : "rounded-lg"} ${selectedTable === t.id ? "border-bordeaux" : "border-[#d8cbb0]"} ${canEditLayout && !readOnly ? "cursor-move touch-none" : ""}`}
                      style={{ left: (pos.x / 100) * CANVAS.w - w / 2, top: (pos.y / 100) * CANVAS.h - h / 2, width: w, height: h }}
                    >
                      <span className="text-xs leading-tight font-semibold">{t.name}</span>
                      <span className="text-[10px] text-muted">{taken} van {t.seats}</span>
                    </div>
                  );
                })}

              {spots.map((s) => {
                const o = occupant(s.key);
                const moved = dinner && ghost && "table" in ghost.src && s.table === ghost.src.table ? state.tables.find((t) => t.id === s.table) : null;
                const shift = moved ? { dx: ((ghost!.x - moved.x) / 100) * CANVAS.w, dy: ((ghost!.y - moved.y) / 100) * CANVAS.h } : { dx: 0, dy: 0 };
                const tone = !o
                  ? "border-dashed border-[#cdbf9f] bg-white/70 text-muted"
                  : o.type === "object"
                    ? objectTone(o.block.kind)
                    : o.state === "guest"
                      ? "border-line bg-white"
                      : o.state === "declined"
                        ? "border-[#e3a3a3] bg-[#f9d4d4]"
                        : "border-[#efb98a] bg-[#fde6cf]";
                const isPicked = pickedSeat === s.key;
                const dragging = ghost && "seat" in ghost.src && ghost.src.seat === s.key;
                const title = !o
                  ? "Lege stoel"
                  : o.type === "object"
                    ? o.label
                    : `${o.label}${o.state === "declined" ? " (afgemeld)" : o.state !== "guest" ? " (nog niet aangemeld)" : ""}${o.partial ? `, ${o.partial}` : ""}`;
                return (
                  <div key={s.key} className="absolute" style={{ left: s.x + shift.dx - SEAT.w / 2, top: s.y + shift.dy - SEAT.h / 2, width: SEAT.w, height: SEAT.h }}>
                    <button
                      type="button"
                      data-seat={s.key}
                      onPointerDown={o ? startDrag({ seat: s.key }) : undefined}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.stopPropagation(); drop(e, s.key); }}
                      onClick={(e) => { e.stopPropagation(); clickPlace({ seat: s.key }); }}
                      title={title}
                      aria-pressed={isPicked}
                      className={`flex h-full w-full items-center justify-center gap-0.5 overflow-hidden rounded-md border px-1 text-[12px] leading-none whitespace-nowrap select-none ${tone} ${isPicked ? "ring-2 ring-bordeaux" : ""} ${dragging ? "opacity-40" : ""} ${o && !readOnly ? "cursor-grab touch-none" : ""}`}
                    >
                      {o ? (o.type === "object" ? renderObject(o.block, true) : <span className="truncate">{o.label}{o.partial ? " ◐" : ""}</span>) : "+"}
                    </button>
                    {isPicked && o && !readOnly && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPicked(null);
                          run(o.type === "object" ? updateObject(coupleId, o.block.id, { remove: true }) : setSeat(coupleId, layout.id, s.key, {}));
                        }}
                        className="absolute -top-2.5 -right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-bordeaux text-xs leading-none text-white shadow"
                        aria-label={o.type === "object" ? `${o.label} verwijderen` : `${o.label} van deze plek halen`}
                        title={o.type === "object" ? "Verwijderen" : "Van deze plek halen"}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}

              {loose.map((b) => {
                const moving = ghost && "object" in ghost.src && ghost.src.object === b.id;
                const pos = moving ? ghost : b;
                const isPicked = pickedObject?.id === b.id;
                return (
                  <div
                    key={b.id}
                    data-object={b.id}
                    onPointerDown={startDrag({ object: b.id }, b)}
                    onClick={(e) => { e.stopPropagation(); clickPlace({ object: b.id }); }}
                    title={objectLabel(b.kind, b.what)}
                    className={`absolute flex max-w-36 items-center gap-1 rounded-md border px-2 py-1 text-[10px] leading-tight select-none ${objectTone(b.kind)} ${isPicked ? "ring-2 ring-bordeaux" : ""} ${moving ? "pointer-events-none opacity-80 shadow-lg" : ""} ${readOnly ? "" : "cursor-move touch-none"}`}
                    style={{ left: (pos.x / 100) * CANVAS.w, top: (pos.y / 100) * CANVAS.h, transform: "translate(-50%, -50%)" }}
                  >
                    {renderObject(b, false)}
                    {!readOnly && (
                      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setPicked(null); run(updateObject(coupleId, b.id, { remove: true })); }} className={`ml-1 ${isCeremonyElement(b.kind) ? "text-white/80" : "text-muted"}`} aria-label={`${objectLabel(b.kind, b.what)} van de plattegrond halen`}>×</button>
                    )}
                  </div>
                );
              })}

              {ghost && "seat" in ghost.src && ghostLabel && (
                <div
                  className={`pointer-events-none absolute flex items-center justify-center gap-0.5 overflow-hidden rounded-md border px-1 text-[12px] leading-none whitespace-nowrap shadow-lg ${ghostLabel.type === "object" ? objectTone(ghostLabel.block.kind) : "border-bordeaux bg-white"}`}
                  style={{ left: (ghost.x / 100) * CANVAS.w - SEAT.w / 2, top: (ghost.y / 100) * CANVAS.h - SEAT.h / 2, width: SEAT.w, height: SEAT.h }}
                >
                  <span className="truncate">{ghostLabel.label}</span>
                </div>
              )}
            </div>
            </div>
          </div>

          {!readOnly && pickedSeat && (seatOccupant?.type === "object" ? (
            <ObjectPanel
              key={`${pickedSeat}-${seatOccupant.block.id}`}
              block={seatOccupant.block}
              onChair
              onRename={(name) => run(updateObject(coupleId, seatOccupant.block.id, { name }))}
              onLoose={() => { setPicked(null); const p = seatPct(pickedSeat); doMove({ seat: pickedSeat }, { point: { x: p.x, y: Math.min(98, p.y + 6) } }); }}
              onRemove={() => { setPicked(null); run(updateObject(coupleId, seatOccupant.block.id, { remove: true })); }}
              onClose={() => setPicked(null)}
            />
          ) : (
            <SeatPanel
              key={pickedSeat}
              occupant={seatOccupant}
              candidates={unplaced}
              dinner={dinner}
              onPick={(guestId) => { run(setSeat(coupleId, layout.id, pickedSeat, { guestId })); setPicked(null); }}
              onName={(name) => { run(setSeat(coupleId, layout.id, pickedSeat, { name })); setPicked(null); }}
              onClear={() => { run(setSeat(coupleId, layout.id, pickedSeat, {})); setPicked(null); }}
              onClose={() => setPicked(null)}
            />
          ))}
          {!readOnly && pickedObject && (
            <ObjectPanel
              key={pickedObject.id}
              block={pickedObject}
              onRename={(name) => run(updateObject(coupleId, pickedObject.id, { name }))}
              onRemove={() => { setPicked(null); run(updateObject(coupleId, pickedObject.id, { remove: true })); }}
              onClose={() => setPicked(null)}
            />
          )}

          {!readOnly && (
            <div className="no-print mt-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                {canEditLayout && dinner && (
                  <>
                    <button type="button" onClick={() => run(addTable(coupleId, layout.id, "round"))} className="btn-secondary py-1.5 text-xs">+ Ronde tafel</button>
                    <button type="button" onClick={() => run(addTable(coupleId, layout.id, "square"))} className="btn-secondary py-1.5 text-xs">+ Vierkante tafel</button>
                    <button type="button" onClick={() => run(addTable(coupleId, layout.id, "long"))} className="btn-secondary py-1.5 text-xs">+ Lange tafel</button>
                  </>
                )}
              </div>
              {canEditLayout && dinner && table && <TablePanel key={table.id} table={table} onChange={(c) => run(updateTable(coupleId, table.id, c))} onDone={() => setSelectedTable(null)} />}
              <AddObject
                dinner={dinner}
                tables={state.tables}
                emptySeat={pickedSeat && !seatOccupant ? pickedSeat : null}
                onAdd={(kind, name, where) => {
                  const n = state.blocks.length;
                  let at: { x: number; y: number };
                  let seatKey: string | null = null;
                  if (where === "seat" && pickedSeat) {
                    seatKey = pickedSeat;
                    at = seatPct(pickedSeat);
                    setPicked(null);
                  } else if (where.startsWith("table:")) {
                    const t = state.tables.find((x) => x.id === where.slice(6));
                    at = t ? { x: t.x, y: Math.min(98, t.y + 4) } : { x: 50, y: 50 };
                  } else if (front) {
                    // Next to the couple at the front, alternately left and right.
                    const offset = front.w / 2 + 75 + (Math.floor(n / 2) % 3) * 120;
                    at = { x: ((front.x + (n % 2 ? offset : -offset)) / CANVAS.w) * 100, y: (front.y / CANVAS.h) * 100 };
                  } else {
                    at = { x: 8 + (n % 8) * 11, y: 6 };
                  }
                  run(addObject(coupleId, layout.id, { kind, name, seatKey, ...at }));
                }}
              />
              {canEditLayout && aisle && <RowsPanel rows={rows} onChange={changeRows} />}
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
                <h3 className="font-serif text-base font-semibold">Uit het stylingplan</h3>
                <p className="mb-2 text-xs text-muted">Styling van {dinner ? "Diner" : "Ceremoniezaal"}. Sleep naar de plattegrond.</p>
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

      {toast && (
        <div role="status" className="no-print fixed bottom-5 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-center text-sm text-cream shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

const ZOOM = { min: 0.5, max: 3 } as const;
const ZOOM_STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5, 3];
/** The next zoom step up (1) or down (-1). */
function zoomStep(zoom: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((z) => z > zoom + 0.001) ?? ZOOM.max;
  return [...ZOOM_STEPS].reverse().find((z) => z < zoom - 0.001) ?? ZOOM.min;
}

const pick = (o?: { x: number; y: number }) => (o ? { x: o.x, y: o.y } : {});

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
  const o = occupant?.type === "person" ? occupant : null;
  const [name, setName] = useState(o && o.state !== "guest" ? o.label : "");
  return (
    <div className="no-print mt-3 space-y-2 rounded-2xl border border-bordeaux/30 bg-white p-4 text-sm shadow-sm">
      <div className="flex items-center justify-between">
        <strong>{o ? o.label : "Lege stoel"}</strong>
        <button type="button" onClick={onClose} className="text-muted" aria-label="Sluiten">×</button>
      </div>
      {o && <p className="text-xs text-muted">Tik op een andere plek om te verplaatsen of te wisselen.</p>}
      {o?.state === "declined" && <p className="text-xs text-red-800">Afgemeld voor de bruiloft.</p>}
      {o && (o.state === "unknown" || o.state === "maybe") && <p className="text-xs text-[#8a4b1c]">Nog niet aangemeld via de RSVP.</p>}
      {o?.state === "maybe" && o.guestId && (
        <button type="button" onClick={() => onPick(o.guestId!)} className="btn-secondary py-1 text-xs">Is dit dezelfde persoon als {o.candidate}? Ja, koppelen</button>
      )}
      <label className="block">
        <span className="label">{o ? "Andere gast kiezen" : "Gast kiezen"}</span>
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
      {o && (
        <button type="button" onClick={onClear} className="btn-ghost py-1 text-xs text-bordeaux">
          {o.label} van deze plek halen
        </button>
      )}
    </div>
  );
}

function ObjectPanel({
  block,
  onChair = false,
  onRename,
  onLoose,
  onRemove,
  onClose,
}: {
  block: Block;
  onChair?: boolean;
  onRename: (name: string) => void;
  onLoose?: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const fromPlan = Boolean(block.styling_item_id);
  const [name, setName] = useState(block.name);
  const type = block.kind === "styling" ? "Styling" : OBJECT_KINDS.find((k) => k.kind === block.kind)?.label ?? "Element";
  return (
    <div className="no-print mt-3 space-y-2 rounded-2xl border border-bordeaux/30 bg-white p-4 text-sm shadow-sm">
      <div className="flex items-center justify-between">
        <strong>{objectLabel(block.kind, block.what)} <span className="text-xs font-normal text-muted">({type})</span></strong>
        <button type="button" onClick={onClose} className="text-muted" aria-label="Sluiten">×</button>
      </div>
      <p className="text-xs text-muted">Sleep het object, of tik op een andere plek om te verplaatsen of te wisselen.</p>
      {fromPlan ? (
        <p className="text-xs text-muted">Uit het stylingplan; de naam pas je daar aan.</p>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); onRename(name); }} className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={block.kind === "styling" ? "Naam" : objectLabel(block.kind, "")} aria-label="Naam" maxLength={60} className="input flex-1 py-1.5" />
          <button type="submit" className="btn-secondary py-1.5 text-xs">Hernoemen</button>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        {onChair && onLoose && <button type="button" onClick={onLoose} className="btn-ghost py-1 text-xs">Van de stoel halen</button>}
        <button type="button" onClick={onRemove} className="btn-ghost py-1 text-xs text-bordeaux">Verwijderen</button>
      </div>
    </div>
  );
}

/** "Styling toevoegen" (dinner) or "Element toevoegen" (ceremony). */
function AddObject({
  dinner,
  tables,
  emptySeat,
  onAdd,
}: {
  dinner: boolean;
  tables: SeatingState["tables"];
  emptySeat: string | null;
  onAdd: (kind: ObjectKind, name: string, where: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ObjectKind>(dinner ? "styling" : "babs");
  const [name, setName] = useState("");
  const [where, setWhere] = useState("loose");
  const named = kind === "styling" || OBJECT_KINDS.find((k) => k.kind === kind)?.named;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary py-1.5 text-xs">
        {dinner ? "+ Styling toevoegen" : "+ Element toevoegen"}
      </button>
    );
  }
  const place = where === "seat" && !emptySeat ? "loose" : where;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (named && !name.trim()) return;
        onAdd(kind, name.trim(), place);
        setName("");
        setOpen(false);
      }}
      className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-white p-3 text-sm"
    >
      {!dinner && (
        <label className="text-xs">Element
          <select value={kind} onChange={(e) => setKind(e.target.value as ObjectKind)} className="input mt-0.5 py-1">
            {OBJECT_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
          </select>
        </label>
      )}
      <label className="text-xs">{named ? "Naam" : "Naam (optioneel)"}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required={Boolean(named)}
          maxLength={60}
          placeholder={kind === "styling" ? "Bijvoorbeeld bloemstuk" : kind === "music" ? "Bijvoorbeeld piano" : kind === "custom" ? "Bijvoorbeeld fotograaf" : objectLabel(kind, "")}
          className="input mt-0.5 w-44 py-1"
        />
      </label>
      <label className="text-xs">Waar
        <select value={place} onChange={(e) => setWhere(e.target.value)} className="input mt-0.5 py-1">
          <option value="loose">{dinner ? "Los op de plattegrond" : "Vooraan, bij het altaar"}</option>
          {dinner && tables.map((t) => <option key={t.id} value={`table:${t.id}`}>Op {t.name || "tafel"}</option>)}
          {emptySeat && <option value="seat">Op de gekozen plek</option>}
        </select>
      </label>
      <button type="submit" className="btn-primary py-1.5 text-xs">Toevoegen</button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">Annuleren</button>
    </form>
  );
}

/** Ceremony rows with an aisle: chairs per row and side, plus "Alle rijen gelijk". */
function RowsPanel({ rows, onChange }: { rows: RowSeats[]; onChange: (rows: RowSeats[], removed?: number) => void }) {
  const [left, setLeft] = useState(rows[0]?.left ?? 6);
  const [right, setRight] = useState(rows[0]?.right ?? 6);
  const set = (i: number, side: "left" | "right", delta: number) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, [side]: Math.max(0, Math.min(MAX_SIDE, r[side] + delta)) } : r)));
  const stepper = (i: number, side: "left" | "right") => (
    <span className="inline-flex items-center gap-1">
      <button type="button" onClick={() => set(i, side, -1)} disabled={rows[i][side] <= 0} className="h-7 w-7 rounded-full border border-line bg-white text-sm leading-none disabled:opacity-30" aria-label={`Rij ${i + 1} ${side === "left" ? "links" : "rechts"}: stoel minder`}>−</button>
      <span className="w-6 text-center tabular-nums">{rows[i][side]}</span>
      <button type="button" onClick={() => set(i, side, 1)} disabled={rows[i][side] >= MAX_SIDE} className="h-7 w-7 rounded-full border border-line bg-white text-sm leading-none disabled:opacity-30" aria-label={`Rij ${i + 1} ${side === "left" ? "links" : "rechts"}: stoel erbij`}>+</button>
    </span>
  );
  return (
    <details className="rounded-2xl border border-line bg-white p-3 text-sm" open>
      <summary className="cursor-pointer font-medium text-bordeaux">Stoelen per rij</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="text-left text-xs text-muted"><th className="pr-3 font-normal">Rij</th><th className="pr-3 font-normal">Links</th><th className="pr-3 font-normal">Rechts</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-0.5 pr-3">{i + 1}</td>
                <td className="py-0.5 pr-3">{stepper(i, "left")}</td>
                <td className="py-0.5 pr-3">{stepper(i, "right")}</td>
                <td className="py-0.5">
                  <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i), i)} disabled={rows.length <= 1} className="text-xs text-muted hover:text-bordeaux disabled:opacity-30" aria-label={`Rij ${i + 1} verwijderen`}>Verwijderen</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <button type="button" onClick={() => onChange([...rows, rows[rows.length - 1] ?? { left: 6, right: 6 }])} disabled={rows.length >= MAX_ROWS} className="btn-secondary py-1 text-xs">+ Rij toevoegen</button>
        <span className="flex flex-wrap items-end gap-2 text-xs">
          <label>Links<input type="number" min={0} max={MAX_SIDE} value={left} onChange={(e) => setLeft(Number(e.target.value))} className="input mt-0.5 w-16 py-1" /></label>
          <label>Rechts<input type="number" min={0} max={MAX_SIDE} value={right} onChange={(e) => setRight(Number(e.target.value))} className="input mt-0.5 w-16 py-1" /></label>
          <button type="button" onClick={() => onChange(evenRows(rows.length, left, right))} className="btn-ghost py-1 text-xs">Alle rijen gelijk</button>
        </span>
      </div>
    </details>
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
