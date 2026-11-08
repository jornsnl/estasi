"use client";

import { useEffect, useRef, useState } from "react";
import type { AssignmentBlock, AssignmentField, AssignmentPart, FieldType, ScaleRow, UploadKind } from "@/lib/data/types";
import {
  ALL_UPLOAD_KINDS,
  ASSIGNMENT_LIMITS,
  FIELD_TYPE_LABELS,
  FIELD_TYPES,
  newField,
  newPart,
  UPLOAD_KINDS,
} from "@/lib/domain/assignment";

/** Another assignment in the course, to pick as "herhaling van". */
export interface AssignmentChoice {
  id: string;
  label: string;
  parts: AssignmentPart[];
}

const makeId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Copies parts with fresh part ids but the same field and row ids, so a repeat can be compared field by field. */
const copyParts = (parts: AssignmentPart[]): AssignmentPart[] =>
  parts.map((p) => ({ ...p, id: makeId(), fields: p.fields.map((f) => ({ ...f, ...("rows" in f ? { rows: f.rows.map((r) => ({ ...r })) } : {}) })) }));

/** Keeps label, help and required when the owner switches a field to another type. */
function changeType(field: AssignmentField, type: FieldType): AssignmentField {
  const next = newField(type, field.id);
  const carried = { ...next, label: field.label, help: field.help, required: field.required };
  if ((type === "single" || type === "multi") && "options" in field) return { ...carried, options: field.options, allowComment: field.allowComment } as AssignmentField;
  if ((type === "scale" || type === "scale_rows") && "min" in field) {
    return { ...carried, min: field.min, max: field.max, minLabel: field.minLabel, maxLabel: field.maxLabel, explanation: field.explanation } as AssignmentField;
  }
  return carried;
}

/**
 * Builds one assignment in the lesson editor: settings, parts and fields of
 * every type, in any order. Everything stays in this component until the
 * lesson is saved; the whole assignment then goes along as JSON in one
 * hidden field (b.<id>.assignment), which the server cleans up again.
 */
export function AssignmentEditor({ block, others }: { block: AssignmentBlock; others: AssignmentChoice[] }) {
  const [a, setA] = useState<AssignmentBlock>(block);
  const hidden = useRef<HTMLInputElement>(null);
  const initial = useRef(JSON.stringify(block));
  // Buttons (add, move, remove) change no form field themselves; tell the unsaved-changes guard.
  useEffect(() => {
    if (JSON.stringify(a) !== initial.current) hidden.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [a]);
  const name = (field: string) => `ae-${block.id}-${field}`;

  const set = (patch: Partial<AssignmentBlock>) => setA((prev) => ({ ...prev, ...patch }));
  const setParts = (fn: (parts: AssignmentPart[]) => AssignmentPart[]) => setA((prev) => ({ ...prev, parts: fn(prev.parts) }));
  const setPart = (pi: number, patch: Partial<AssignmentPart>) => setParts((parts) => parts.map((p, i) => (i === pi ? { ...p, ...patch } : p)));
  const setField = (pi: number, fi: number, field: AssignmentField) =>
    setParts((parts) => parts.map((p, i) => (i === pi ? { ...p, fields: p.fields.map((f, j) => (j === fi ? field : f)) } : p)));

  const movePart = (pi: number, dir: -1 | 1) =>
    setParts((parts) => {
      const j = pi + dir;
      if (j < 0 || j >= parts.length) return parts;
      const next = [...parts];
      [next[pi], next[j]] = [next[j], next[pi]];
      return next;
    });

  /** Up and down within a part; at the edge the field moves on to the neighbouring part. */
  const moveField = (pi: number, fi: number, dir: -1 | 1) =>
    setParts((parts) => {
      const next = parts.map((p) => ({ ...p, fields: [...p.fields] }));
      const fields = next[pi].fields;
      const j = fi + dir;
      if (j >= 0 && j < fields.length) {
        [fields[fi], fields[j]] = [fields[j], fields[fi]];
      } else if (next[pi + dir]) {
        const [field] = fields.splice(fi, 1);
        if (dir === -1) next[pi - 1].fields.push(field);
        else next[pi + 1].fields.unshift(field);
      }
      return next;
    });

  const removeField = (pi: number, fi: number) => setParts((parts) => parts.map((p, i) => (i === pi ? { ...p, fields: p.fields.filter((_, j) => j !== fi) } : p)));
  const addField = (pi: number, type: FieldType) => setParts((parts) => parts.map((p, i) => (i === pi ? { ...p, fields: [...p.fields, newField(type, makeId())] } : p)));

  const repeated = others.find((o) => o.id === a.repeatOf);
  const fieldCount = a.parts.reduce((n, p) => n + p.fields.length, 0);

  return (
    <div className="space-y-5">
      <input ref={hidden} type="hidden" name={`b.${block.id}.assignment`} value={JSON.stringify(a)} />

      <div className="grid gap-3">
        <div>
          <label className="label" htmlFor={name("title")}>Titel van de opdracht</label>
          <input id={name("title")} value={a.title} maxLength={ASSIGNMENT_LIMITS.title} className="input" onChange={(e) => set({ title: e.target.value })} placeholder="Bijvoorbeeld: Competentiescan (beginmeting)" />
        </div>
        <div>
          <label className="label" htmlFor={name("intro")}>Uitleg bij de opdracht (optioneel)</label>
          <textarea id={name("intro")} value={a.intro} rows={3} maxLength={ASSIGNMENT_LIMITS.intro} className="input" onChange={(e) => set({ intro: e.target.value })} />
        </div>
      </div>

      <fieldset className="grid gap-2 rounded-lg bg-cream/60 p-4 text-sm sm:grid-cols-2">
        <legend className="sr-only">Instellingen</legend>
        <Check checked={a.requiredForLesson} onChange={(v) => set({ requiredForLesson: v })}>
          Verplicht om de les af te ronden
        </Check>
        <Check checked={a.feedbackAllowed} onChange={(v) => set({ feedbackAllowed: v })}>
          Cursist mag persoonlijke feedback vragen
        </Check>
        <Check checked={a.graded} onChange={(v) => set({ graded: v })}>
          Eindopdracht (ik beoordeel: voldoende of verbetering nodig)
        </Check>
        <div className="sm:col-span-2">
          <label className="label" htmlFor={name("repeat")}>Herhaling van een eerdere opdracht (bijvoorbeeld de eindmeting van een scan)</label>
          <select id={name("repeat")} value={a.repeatOf ?? ""} className="input" onChange={(e) => set({ repeatOf: e.target.value || null })}>
            <option value="">Nee, dit is een losse opdracht</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
          {repeated && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="hint">De cursist ziet haar eerdere scores naast de nieuwe.</span>
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-xs"
                onClick={() => {
                  if (fieldCount === 0 || window.confirm("De onderdelen van deze opdracht vervangen door die van de eerdere opdracht?")) set({ parts: copyParts(repeated.parts) });
                }}
              >
                Onderdelen overnemen van de eerdere opdracht
              </button>
            </div>
          )}
        </div>
      </fieldset>

      {a.parts.map((part, pi) => (
        <section key={part.id} className="rounded-lg border border-line p-4" aria-label={`Onderdeel ${pi + 1}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="eyebrow">Onderdeel {pi + 1}</span>
            <div className="flex items-center gap-1">
              <IconButton label="Onderdeel omhoog" disabled={pi === 0} onClick={() => movePart(pi, -1)}>↑</IconButton>
              <IconButton label="Onderdeel omlaag" disabled={pi === a.parts.length - 1} onClick={() => movePart(pi, 1)}>↓</IconButton>
              <button
                type="button"
                className="btn-ghost px-2 py-1.5 text-xs text-bordeaux"
                onClick={() => {
                  if (part.fields.length === 0 || window.confirm(`Onderdeel ${pi + 1} met ${part.fields.length} veld(en) verwijderen?`)) setParts((parts) => parts.filter((_, i) => i !== pi));
                }}
              >
                Onderdeel verwijderen
              </button>
            </div>
          </div>
          <div className="grid gap-3">
            <input aria-label={`Kop van onderdeel ${pi + 1}`} value={part.title} maxLength={ASSIGNMENT_LIMITS.title} className="input" placeholder={a.parts.length > 1 ? `Onderdeel ${pi + 1}: …` : "Kop (optioneel)"} onChange={(e) => setPart(pi, { title: e.target.value })} />
            <textarea aria-label={`Uitleg bij onderdeel ${pi + 1}`} value={part.intro} rows={2} maxLength={ASSIGNMENT_LIMITS.intro} className="input" placeholder="Uitleg bij dit onderdeel (optioneel)" onChange={(e) => setPart(pi, { intro: e.target.value })} />
          </div>

          <ol className="mt-4 space-y-3">
            {part.fields.map((field, fi) => {
              const first = pi === 0 && fi === 0;
              const last = pi === a.parts.length - 1 && fi === part.fields.length - 1;
              return (
                <li key={field.id} className="rounded-lg border border-line bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <select
                      aria-label="Soort veld"
                      value={field.type}
                      className="input w-auto py-1.5 text-sm"
                      onChange={(e) => setField(pi, fi, changeType(field, e.target.value as FieldType))}
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <label className="mr-2 flex items-center gap-1.5 text-sm">
                        <input type="checkbox" checked={field.required} onChange={(e) => setField(pi, fi, { ...field, required: e.target.checked })} className="accent-[#722F37]" />
                        Verplicht
                      </label>
                      <IconButton label="Veld omhoog" disabled={first} onClick={() => moveField(pi, fi, -1)}>↑</IconButton>
                      <IconButton label="Veld omlaag" disabled={last} onClick={() => moveField(pi, fi, 1)}>↓</IconButton>
                      <button type="button" className="btn-ghost px-2 py-1.5 text-xs text-bordeaux" onClick={() => removeField(pi, fi)}>Verwijderen</button>
                    </div>
                  </div>
                  <FieldSettings field={field} onChange={(f) => setField(pi, fi, f)} />
                </li>
              );
            })}
          </ol>
          {part.fields.length === 0 && <p className="mt-3 text-sm text-muted">Nog geen velden in dit onderdeel.</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-sm text-muted" htmlFor={name(`add-${part.id}`)}>Veld toevoegen:</label>
            <select
              id={name(`add-${part.id}`)}
              value=""
              className="input w-auto py-1.5 text-sm"
              onChange={(e) => {
                if (e.target.value) addField(pi, e.target.value as FieldType);
              }}
            >
              <option value="">Kies een soort…</option>
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
        </section>
      ))}

      <button type="button" className="btn-secondary px-3 py-2" onClick={() => setParts((parts) => [...parts, newPart(makeId())])}>
        + Onderdeel toevoegen
      </button>
      {fieldCount === 0 && <p className="text-sm text-bordeaux">Deze opdracht heeft nog geen velden; voeg er minstens één toe.</p>}
    </div>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-[#722F37]" />
      <span>{children}</span>
    </label>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="btn-ghost px-2 py-1.5 disabled:opacity-25">
      {children}
    </button>
  );
}

const lines = (text: string) => text.split("\n").slice(0, ASSIGNMENT_LIMITS.rows);

function FieldSettings({ field, onChange }: { field: AssignmentField; onChange: (f: AssignmentField) => void }) {
  const id = (part: string) => `fs-${field.id}-${part}`;
  return (
    <div className="grid gap-3">
      <div>
        <label className="label" htmlFor={id("label")}>Vraag of opdracht</label>
        <textarea id={id("label")} value={field.label} rows={2} maxLength={ASSIGNMENT_LIMITS.label} className="input" onChange={(e) => onChange({ ...field, label: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor={id("help")}>Toelichting (optioneel)</label>
        <input id={id("help")} value={field.help} maxLength={ASSIGNMENT_LIMITS.help} className="input" onChange={(e) => onChange({ ...field, help: e.target.value })} />
      </div>

      {(field.type === "single" || field.type === "multi") && (
        <>
          <div>
            <label className="label" htmlFor={id("opt")}>Antwoordopties (één per regel)</label>
            <textarea id={id("opt")} value={field.options.join("\n")} rows={4} className="input" onChange={(e) => onChange({ ...field, options: lines(e.target.value).slice(0, ASSIGNMENT_LIMITS.options) })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={field.allowComment} onChange={(e) => onChange({ ...field, allowComment: e.target.checked })} className="accent-[#722F37]" />
            Ruimte voor een toelichting onder de keuze
          </label>
        </>
      )}

      {field.type === "scale_rows" && (
        <>
          <div>
            <label className="label" htmlFor={id("rows")}>Onderwerpen (één per regel, de cursist vult per regel in)</label>
            <textarea
              id={id("rows")}
              value={field.rows.map((r) => r.label).join("\n")}
              rows={Math.min(12, Math.max(4, field.rows.length + 1))}
              className="input"
              onChange={(e) => {
                // A row keeps its id by position, so renaming a row keeps the answers to it.
                const rows: ScaleRow[] = lines(e.target.value).map((label, i) => ({ id: field.rows[i]?.id ?? makeId(), label }));
                onChange({ ...field, rows });
              }}
            />
          </div>
          <div>
            <label className="label" htmlFor={id("mode")}>Per onderwerp</label>
            <select id={id("mode")} value={field.mode} className="input w-auto" onChange={(e) => onChange({ ...field, mode: e.target.value === "text" ? "text" : "score" })}>
              <option value="score">Een score op de schaal</option>
              <option value="text">Een eigen antwoord (tekst)</option>
            </select>
          </div>
        </>
      )}

      {(field.type === "scale" || (field.type === "scale_rows" && field.mode === "score")) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-end gap-2">
            <div>
              <label className="label" htmlFor={id("min")}>Van</label>
              <select id={id("min")} value={field.min} className="input w-20" onChange={(e) => onChange({ ...field, min: Math.min(Number(e.target.value), field.max - 1) })}>
                {[0, 1].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor={id("max")}>Tot en met</label>
              <select id={id("max")} value={field.max} className="input w-20" onChange={(e) => onChange({ ...field, max: Math.max(Number(e.target.value), field.min + 1) })}>
                {[3, 4, 5, 6, 7, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor={id("minl")}>Betekenis laagste</label>
              <input id={id("minl")} value={field.minLabel} maxLength={ASSIGNMENT_LIMITS.option} className="input" placeholder="Nog niet sterk" onChange={(e) => onChange({ ...field, minLabel: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor={id("maxl")}>Betekenis hoogste</label>
              <input id={id("maxl")} value={field.maxLabel} maxLength={ASSIGNMENT_LIMITS.option} className="input" placeholder="Heel sterk" onChange={(e) => onChange({ ...field, maxLabel: e.target.value })} />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor={id("expl")}>Uitleg van de scores (staat boven de schaal)</label>
            <textarea id={id("expl")} value={field.explanation} rows={4} maxLength={ASSIGNMENT_LIMITS.intro} className="input" onChange={(e) => onChange({ ...field, explanation: e.target.value })} />
          </div>
        </div>
      )}

      {field.type === "upload" && (
        <div className="grid gap-3">
          <fieldset>
            <legend className="label">Toegestane bestandstypes</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {ALL_UPLOAD_KINDS.map((kind) => (
                <label key={kind} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={field.accept.includes(kind)}
                    className="accent-[#722F37]"
                    onChange={(e) => {
                      const accept: UploadKind[] = e.target.checked ? [...field.accept, kind] : field.accept.filter((k) => k !== kind);
                      onChange({ ...field, accept: ALL_UPLOAD_KINDS.filter((k) => accept.includes(k)) });
                    }}
                  />
                  {UPLOAD_KINDS[kind].label}
                </label>
              ))}
            </div>
            {field.accept.length === 0 && <p className="mt-1 text-sm text-bordeaux">Kies minstens één type (anders wordt het alleen pdf).</p>}
          </fieldset>
          <div>
            <label className="label" htmlFor={id("max")}>Maximaal aantal bestanden</label>
            <input id={id("max")} type="number" min={1} max={ASSIGNMENT_LIMITS.maxFiles} value={field.maxFiles} className="input w-24" onChange={(e) => onChange({ ...field, maxFiles: Math.min(ASSIGNMENT_LIMITS.maxFiles, Math.max(1, Number(e.target.value) || 1)) })} />
          </div>
        </div>
      )}
    </div>
  );
}
