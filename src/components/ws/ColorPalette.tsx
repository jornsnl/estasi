"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { hexToHsv, hsvToHex, isLight, normalizeHex, WEDDING_COLORS, type Hsv, type PaletteColor } from "@/lib/ws/color";

/**
 * The colour palette of the styling plan, inside the form of the plan: click a
 * colour to change it, drag to reorder, "Kleur toevoegen" opens the picker.
 * Sends `colors` (hex codes in order) and `colorNames` (JSON, name per hex).
 */
export function ColorPalette({ initial, max = 12 }: { initial: PaletteColor[]; max?: number }) {
  const [palette, setPalette] = useState<PaletteColor[]>(initial);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [changed, setChanged] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const drag = useRef<{ index: number; x: number; y: number; moved: boolean } | null>(null);
  const list = useRef<HTMLUListElement>(null);

  const update = (next: PaletteColor[]) => {
    setPalette(next);
    setChanged(true);
  };
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= palette.length) return;
    const next = [...palette];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    update(next);
  };

  // Drag with pointer events (mouse, touch and pen); a short tap opens the picker.
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>, index: number) => {
    if (e.button !== 0) return;
    drag.current = { index, x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    d.moved = true;
    setDragging(d.index);
    const target = Array.from(list.current?.querySelectorAll<HTMLElement>("[data-swatch]") ?? []).findIndex((el) => {
      const r = el.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (target >= 0 && target !== d.index) {
      move(d.index, target);
      d.index = target;
      setDragging(target);
    }
  };
  const onPointerUp = (index: number) => {
    const d = drag.current;
    drag.current = null;
    setDragging(null);
    if (d && !d.moved) setEditing(index);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setEditing(index);
    } else if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const to = index + (e.key === "ArrowLeft" ? -1 : 1);
      move(index, to);
      requestAnimationFrame(() => list.current?.querySelectorAll<HTMLElement>("[data-swatch]")[to]?.focus());
    }
  };

  const current = editing === "new" ? null : editing === null ? null : palette[editing];

  return (
    <div>
      <input type="hidden" name="colors" value={palette.map((p) => p.hex).join(" ")} />
      <input type="hidden" name="colorNames" value={JSON.stringify(Object.fromEntries(palette.filter((p) => p.name).map((p) => [p.hex, p.name])))} />
      <ul ref={list} className="flex flex-wrap items-start gap-3">
        {palette.map((p, i) => (
          <li key={`${p.hex}-${i}`} className="w-16 text-center">
            <button
              type="button"
              data-swatch
              onPointerDown={(e) => onPointerDown(e, i)}
              onPointerMove={onPointerMove}
              onPointerUp={() => onPointerUp(i)}
              onPointerCancel={() => { drag.current = null; setDragging(null); }}
              onKeyDown={(e) => onKeyDown(e, i)}
              aria-label={`${p.name || p.hex} aanpassen (Alt + pijltjes om te verplaatsen)`}
              title="Klik om aan te passen, sleep om te verplaatsen"
              className={`h-14 w-14 cursor-grab touch-none rounded-xl border border-line shadow-sm transition-transform active:cursor-grabbing ${dragging === i ? "scale-110 ring-2 ring-gold" : "hover:scale-105"}`}
              style={{ background: p.hex }}
            />
            <span className="mt-1 block truncate text-xs text-ink">{p.name || " "}</span>
            <span className="block font-mono text-[11px] text-muted">{p.hex}</span>
          </li>
        ))}
        {palette.length < max && (
          <li className="w-16">
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="flex h-14 w-14 items-center justify-center rounded-xl border-2 border-dashed border-gold text-2xl text-gold-ink transition-colors hover:bg-gold-soft"
              aria-label="Kleur toevoegen"
              title="Kleur toevoegen"
            >
              +
            </button>
          </li>
        )}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {palette.length < max && (
          <button type="button" onClick={() => setEditing("new")} className="btn-secondary py-1.5">Kleur toevoegen</button>
        )}
        <span className="hint !mt-0">{palette.length > 1 ? "Klik op een kleur om aan te passen, sleep om de volgorde te veranderen." : "Voeg de kleuren van het palet toe."}</span>
        {changed && <span role="status" className="text-xs text-bordeaux">Klik op Opslaan om het palet te bewaren.</span>}
      </div>
      {editing !== null && (
        <ColorDialog
          initial={current ?? { hex: "#a89650", name: "" }}
          isNew={editing === "new"}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            if (editing === "new") update([...palette, c]);
            else update(palette.map((p, i) => (i === editing ? c : p)));
            setEditing(null);
          }}
          onDelete={editing === "new" ? undefined : () => {
            update(palette.filter((_, i) => i !== editing));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** The picker: a field for lighter/darker and more/less colour, a hue slider, preview, hex, suggestions and a name. */
function ColorDialog({
  initial,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  initial: PaletteColor;
  isNew: boolean;
  onClose: () => void;
  onSave: (c: PaletteColor) => void;
  onDelete?: () => void;
}) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(initial.hex));
  const [hexText, setHexText] = useState(initial.hex);
  const [name, setName] = useState(initial.name);
  const field = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const hex = hsvToHex(hsv);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    dialog.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setFromHsv = (next: Hsv) => {
    setHsv(next);
    setHexText(hsvToHex(next));
  };
  const pickAt = (clientX: number, clientY: number) => {
    const r = field.current?.getBoundingClientRect();
    if (!r) return;
    const s = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const v = Math.min(1, Math.max(0, 1 - (clientY - r.top) / r.height));
    setFromHsv({ ...hsv, s, v });
  };
  const onFieldKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (!d) return;
    e.preventDefault();
    setFromHsv({ ...hsv, s: Math.min(1, Math.max(0, hsv.s + d[0])), v: Math.min(1, Math.max(0, hsv.v + d[1])) });
  };

  const save = () => onSave({ hex, name: name.trim() });
  const enterSaves = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  };

  // In a portal (inside the portal theme, outside the form of the plan: Enter must not submit that form).
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={isNew ? "Kleur toevoegen" : "Kleur aanpassen"} className="max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <h3 className="text-lg">{isNew ? "Kleur toevoegen" : "Kleur aanpassen"}</h3>

        <div
          ref={field}
          role="slider"
          tabIndex={0}
          data-autofocus
          aria-label="Lichter en donkerder, meer en minder kleur"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hsv.v * 100)}
          aria-valuetext={`verzadiging ${Math.round(hsv.s * 100)}%, helderheid ${Math.round(hsv.v * 100)}%`}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pickAt(e.clientX, e.clientY); }}
          onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) pickAt(e.clientX, e.clientY); }}
          onKeyDown={onFieldKey}
          className="relative mt-3 h-44 w-full cursor-crosshair touch-none rounded-xl"
          style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}
        >
          <span
            className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
            style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }}
          />
        </div>

        <label className="mt-3 block text-xs text-muted" htmlFor="hue">Tint</label>
        <input
          id="hue"
          type="range"
          min={0}
          max={359}
          value={Math.round(hsv.h)}
          onChange={(e) => setFromHsv({ ...hsv, h: Number(e.target.value), s: hsv.s || 0.6, v: hsv.v || 0.8 })}
          className="ws-hue mt-1 w-full"
        />

        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-xl border border-line text-[11px] font-medium" style={{ background: hex, color: isLight(hex) ? "#2c2c2c" : "#ffffff" }} aria-label="Voorbeeld">
            Voorbeeld
          </div>
          <div className="min-w-0 flex-1">
            <label className="text-xs text-muted" htmlFor="hex">Hexcode (optioneel)</label>
            <input
              id="hex"
              value={hexText}
              onChange={(e) => {
                setHexText(e.target.value);
                const n = normalizeHex(e.target.value);
                if (n) setHsv(hexToHsv(n));
              }}
              onBlur={() => setHexText(hex)}
              onKeyDown={enterSaves}
              spellCheck={false}
              className="input py-1.5 font-mono"
            />
          </div>
        </div>

        <p className="mt-4 text-xs text-muted">Veelgekozen trouwkleuren</p>
        <div className="mt-1.5 grid grid-cols-8 gap-1.5">
          {WEDDING_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              title={c.name}
              aria-label={c.name}
              onClick={() => {
                setFromHsv(hexToHsv(c.hex));
                if (!name.trim() || WEDDING_COLORS.some((w) => w.name === name)) setName(c.name);
              }}
              className={`aspect-square rounded-lg border ${hex === c.hex ? "border-bordeaux ring-2 ring-bordeaux/40" : "border-line"}`}
              style={{ background: c.hex }}
            />
          ))}
        </div>

        <label className="mt-4 block text-xs text-muted" htmlFor="colorName">Naam van de kleur (optioneel)</label>
        <input id="colorName" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} onKeyDown={enterSaves} placeholder="Bijvoorbeeld: Saliegroen" className="input py-1.5" />

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          {onDelete ? (
            <button type="button" onClick={onDelete} className="text-sm text-bordeaux hover:underline">Verwijderen</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost py-1.5">Annuleren</button>
            <button type="button" onClick={save} className="btn-primary py-1.5">{isNew ? "Toevoegen" : "Opslaan"}</button>
          </div>
        </div>
      </div>
    </div>,
    document.querySelector(".ws-theme") ?? document.body,
  );
}
