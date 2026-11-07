"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { deletePerson, deleteRow, moveRunsheetRow, saveRow, setPersonColor, type RowInput } from "@/app/actions/ws-runsheet";
import { AutoTextarea } from "@/components/ws/AutoTextarea";
import { timeOutOfOrder } from "@/lib/ws/pure";

export interface EditorRow {
  id: string;
  at_time: string;
  people: string[];
  what: string;
  info: string;
  location: string;
  rain_location: string;
  by_admin: boolean;
  created_by_name: string;
}
export interface EditorPerson {
  id: string;
  name: string;
  color: string;
}

type Field = "at_time" | "what" | "info" | "location" | "rain_location";
const SCHEDULE: [Field | "people", string][] = [["at_time", "Tijd"], ["people", "Wie"], ["what", "Wat"], ["info", "Meer info"], ["location", "Waar"], ["rain_location", "Waar (regen)"]];
const LIST: [Field | "people", string][] = [["what", "Wat"], ["people", "Wie"], ["info", "Meer info"]];
const GRID = {
  schedule: "sm:grid-cols-[2.25rem_4.5rem_minmax(8rem,1fr)_minmax(9rem,1.4fr)_minmax(9rem,1.4fr)_minmax(6rem,1fr)_minmax(6rem,1fr)_2rem]",
  list: "sm:grid-cols-[2.25rem_minmax(10rem,1.6fr)_minmax(8rem,1fr)_minmax(10rem,1.8fr)_2rem]",
};

/**
 * The day planning (and the simple list tabs). Every field can be edited by
 * clicking it and is saved when you leave the row. Rows move with the grip
 * on the left or the arrows; Sabine's rows are read-only for the couple.
 */
export function RunsheetEditor({
  coupleId,
  tabId,
  kind,
  isAdmin,
  initialRows,
  initialPeople,
  palette,
}: {
  coupleId: string;
  tabId: string;
  kind: "schedule" | "list";
  isAdmin: boolean;
  initialRows: EditorRow[];
  initialPeople: EditorPerson[];
  palette: string[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [people, setPeople] = useState(initialPeople);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ id: string; from: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [, start] = useTransition();
  const columns = kind === "schedule" ? SCHEDULE : LIST;
  const colorOf = (name: string) => people.find((p) => p.name.toLowerCase() === name.toLowerCase())?.color;

  const apply = (result: Awaited<ReturnType<typeof saveRow>>) => {
    if (result.ok) {
      setRows(result.rows);
      setPeople(result.people);
      setError("");
    } else setError(result.error);
  };
  const canEdit = (row: EditorRow) => isAdmin || !row.by_admin;

  function move(id: string, to: number, undoable = true) {
    const from = rows.findIndex((r) => r.id === id);
    if (from === -1 || to === from || to < 0 || to >= rows.length) return;
    // Show it at once; the server confirms.
    const next = [...rows];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    setRows(next);
    if (undoable) setToast({ id, from });
    start(async () => apply(await moveRunsheetRow(coupleId, tabId, id, to)));
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="space-y-3">
      {/* Legend: who has which colour. */}
      <Legend coupleId={coupleId} people={people} palette={palette} isAdmin={isAdmin} onChange={setPeople} />

      <div className="card p-3 sm:p-4">
        <div className={`hidden gap-2 px-1 pb-2 text-xs font-medium text-bordeaux sm:grid ${GRID[kind]}`}>
          <span />
          {columns.map(([, label]) => <span key={label}>{label}</span>)}
          <span />
        </div>
        <div onDragEnd={() => { setDragId(null); setDropAt(null); }}>
          {rows.map((row, i) => (
            <div
              key={row.id}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                const box = e.currentTarget.getBoundingClientRect();
                setDropAt(e.clientY < box.top + box.height / 2 ? i : i + 1);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && dropAt !== null) {
                  const from = rows.findIndex((r) => r.id === dragId);
                  move(dragId, dropAt > from ? dropAt - 1 : dropAt);
                }
                setDragId(null);
                setDropAt(null);
              }}
              className={`relative ${dropAt === i && dragId ? "before:absolute before:inset-x-0 before:-top-0.5 before:h-0.5 before:bg-bordeaux" : ""} ${dropAt === i + 1 && dragId && i === rows.length - 1 ? "after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:bg-bordeaux" : ""}`}
            >
              <Row
                row={row}
                kind={kind}
                index={i}
                count={rows.length}
                editable={canEdit(row)}
                isAdmin={isAdmin}
                badTime={kind === "schedule" && timeOutOfOrder(rows, i)}
                colorOf={colorOf}
                people={people}
                palette={palette}
                onSave={(input, colors) => start(async () => apply(await saveRow(coupleId, tabId, row.id, input, colors)))}
                onDelete={() => start(async () => apply(await deleteRow(coupleId, tabId, row.id)))}
                onMove={(to) => move(row.id, to)}
                onDragStart={() => setDragId(row.id)}
              />
            </div>
          ))}
        </div>
        {rows.length === 0 && <p className="px-1 py-3 text-sm text-muted">Nog geen regels.</p>}
        <button
          type="button"
          onClick={() => start(async () => apply(await saveRow(coupleId, tabId, null, {})))}
          className="btn-secondary mt-3 py-1.5 text-xs"
        >
          + Regel toevoegen
        </button>
        {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
      </div>

      {toast && (
        <div role="status" className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-full bg-ink px-5 py-2.5 text-sm text-cream shadow-lg">
          Verplaatst
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              move(toast.id, toast.from, false);
              setToast(null);
            }}
          >
            Ongedaan maken
          </button>
        </div>
      )}
    </div>
  );
}

function Row(props: {
  row: EditorRow;
  kind: "schedule" | "list";
  index: number;
  count: number;
  editable: boolean;
  isAdmin: boolean;
  badTime: boolean;
  colorOf: (name: string) => string | undefined;
  people: EditorPerson[];
  palette: string[];
  onSave: (input: RowInput, colors?: Record<string, string>) => void;
  onDelete: () => void;
  onMove: (to: number) => void;
  onDragStart: () => void;
}) {
  const { row, kind, editable } = props;
  const [draft, setDraft] = useState(row);
  const [newColors, setNewColors] = useState<Record<string, string>>({});
  const dirty = useRef(false);
  // Fresh data from the server, but never over what is being typed in this row.
  useEffect(() => {
    if (!dirty.current) setDraft(row);
  }, [row]);
  const stripe = props.colorOf(draft.people[0] ?? "") ?? "transparent";
  const columns = kind === "schedule" ? SCHEDULE : LIST;

  const set = (patch: Partial<EditorRow>) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  };
  // Saved when focus leaves the row, so one row is one save.
  const onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (!dirty.current) return;
    dirty.current = false;
    props.onSave(
      { at_time: draft.at_time, what: draft.what, info: draft.info, location: draft.location, rain_location: draft.rain_location, people: draft.people },
      newColors,
    );
  };
  const text = (field: Field, label: string) =>
    editable ? (
      <AutoTextarea
        value={draft[field]}
        onChange={(e) => set({ [field]: e.target.value })}
        aria-label={label}
        placeholder={label}
        className={`input min-h-9 flex-1 py-1.5 text-sm ${field === "at_time" && props.badTime ? "border-red-300 bg-red-50" : ""}`}
      />
    ) : (
      <p className={`min-h-9 flex-1 rounded-lg px-2 py-1.5 text-sm whitespace-pre-line ${field === "at_time" && props.badTime ? "bg-red-50" : ""}`}>
        {draft[field] || <span className="sm:hidden text-muted">–</span>}
      </p>
    );

  return (
    <div
      onBlur={onBlur}
      className={`mb-2 grid items-stretch gap-2 rounded-xl border-l-4 bg-cream/50 p-2 sm:mb-1.5 sm:bg-transparent sm:p-1 ${GRID[kind]}`}
      style={{ borderLeftColor: stripe }}
    >
      <div className="flex items-start gap-0.5 sm:flex-col">
        {editable ? (
          <>
            <span
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", row.id);
                props.onDragStart();
              }}
              title="Slepen om te verplaatsen"
              aria-hidden="true"
              className="hidden cursor-grab px-1 text-muted select-none sm:block"
            >
              ⋮⋮
            </span>
            <button type="button" disabled={props.index === 0} onClick={() => props.onMove(props.index - 1)} className="px-1 text-xs text-muted disabled:opacity-25" aria-label="Omhoog">↑</button>
            <button type="button" disabled={props.index === props.count - 1} onClick={() => props.onMove(props.index + 1)} className="px-1 text-xs text-muted disabled:opacity-25" aria-label="Omlaag">↓</button>
          </>
        ) : (
          <span className="px-1 text-xs text-muted" title="Rij van Sabine">🔒</span>
        )}
      </div>
      {columns.map(([field, label]) =>
        field === "people" ? (
          <PeoplePicker
            key="people"
            value={draft.people}
            editable={editable}
            people={props.people}
            palette={props.palette}
            colorOf={(n) => props.colorOf(n) ?? newColors[n]}
            onChange={(list, color) => {
              if (color) setNewColors((c) => ({ ...c, ...color }));
              set({ people: list });
            }}
          />
        ) : (
          <div key={field} className="flex flex-col">{text(field, label)}</div>
        ),
      )}
      <div className="flex flex-col items-end justify-between">
        {editable && (
          <button type="button" onClick={() => confirm("Deze regel verwijderen?") && props.onDelete()} className="px-1 text-sm text-muted hover:text-bordeaux" aria-label="Regel verwijderen">×</button>
        )}
        {props.isAdmin && row.created_by_name && <span className="text-[10px] whitespace-nowrap text-muted" title="Toegevoegd door">{row.created_by_name}</span>}
      </div>
    </div>
  );
}

/** Names with their colour; typing shows the known names, a new name asks for a colour. */
function PeoplePicker(props: {
  value: string[];
  editable: boolean;
  people: EditorPerson[];
  palette: string[];
  colorOf: (name: string) => string | undefined;
  onChange: (list: string[], color?: Record<string, string>) => void;
}) {
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(false);
  const query = text.trim().toLowerCase();
  const known = props.people.find((p) => p.name.toLowerCase() === query);
  const suggestions = props.people.filter((p) => !props.value.includes(p.name) && (!query || p.name.toLowerCase().includes(query))).slice(0, 6);
  const add = (name: string, color?: string) => {
    const clean = name.trim();
    if (!clean || props.value.some((v) => v.toLowerCase() === clean.toLowerCase())) return setText("");
    props.onChange([...props.value, clean], color ? { [clean]: color } : undefined);
    setText("");
  };
  const chip = (name: string) => (
    <span key={name} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-ink" style={{ background: props.colorOf(name) ?? "#ecebe8" }}>
      {name}
      {props.editable && (
        <button type="button" onClick={() => props.onChange(props.value.filter((v) => v !== name))} aria-label={`${name} weghalen`} className="text-ink/60 hover:text-ink">×</button>
      )}
    </span>
  );
  if (!props.editable) return <div className="flex min-h-9 flex-wrap content-start gap-1 px-1 py-1.5">{props.value.map(chip)}</div>;
  return (
    <div className="relative flex flex-col">
      <div className="input flex min-h-9 flex-1 flex-wrap content-start items-center gap-1 py-1">
        {props.value.map(chip)}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && text.trim()) {
              e.preventDefault();
              if (known) add(known.name);
            }
          }}
          aria-label="Naam toevoegen"
          placeholder={props.value.length ? "" : "Naam"}
          className="min-w-12 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      {focus && (suggestions.length > 0 || (query && !known)) && (
        <div className="absolute z-20 mt-1 w-56 rounded-xl bg-white p-2 text-sm shadow-lg">
          {suggestions.map((p) => (
            <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(p.name)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-cream">
              <span className="h-3 w-3 rounded-full" style={{ background: p.color }} /> {p.name}
            </button>
          ))}
          {query && !known && (
            <div className="border-t border-line px-2 pt-2">
              <p className="text-xs text-muted">Nieuwe naam &quot;{text.trim()}&quot;: kies een kleur</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {props.palette.map((c) => (
                  <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(text, c)} className="h-6 w-6 rounded-full border border-line" style={{ background: c }} aria-label={`Kleur ${c}`} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Legend({ coupleId, people, palette, isAdmin, onChange }: { coupleId: string; people: EditorPerson[]; palette: string[]; isAdmin: boolean; onChange: (p: EditorPerson[]) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [, start] = useTransition();
  if (people.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted">Legenda:</span>
      {people.map((p) => (
        <span key={p.id} className="relative">
          <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium" style={{ background: p.color }} title="Kleur aanpassen">
            {p.name}
          </button>
          {open === p.id && (
            <span className="absolute left-0 z-20 mt-1 flex w-48 flex-wrap gap-1 rounded-xl bg-white p-2 shadow-lg">
              {palette.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => start(async () => { const r = await setPersonColor(coupleId, p.id, c); if (r.people) onChange(r.people); setOpen(null); })}
                  className={`h-6 w-6 rounded-full border ${c === p.color ? "border-ink" : "border-line"}`}
                  style={{ background: c }}
                  aria-label={`Kleur ${c}`}
                />
              ))}
              {isAdmin && (
                <button type="button" onClick={() => start(async () => { const r = await deletePerson(coupleId, p.id); if (r.people) onChange(r.people); setOpen(null); })} className="mt-1 w-full text-left text-muted hover:text-bordeaux">
                  Naam van de lijst halen
                </button>
              )}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
