"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { CROP_ZOOM, DEFAULT_CROP, normaliseCrop, type LogoCrop } from "@/lib/brand-logo-urls";

/**
 * Feedback Sabine (nr. 3): a square logo got a white border in the app icon. Here she picks the
 * crop herself: a square shows the icon as it will be (white behind the logo), she drags the logo
 * to move it and sets its size with the slider (100% = edge to edge, more cuts it off). The crop
 * goes along with the form as "zoom,x,y" (crop-<kind>) and the server makes the pngs from it
 * (src/lib/brand-logos.ts). Works for the logo already there and for a newly chosen one.
 */
export function LogoCropper({
  kind,
  label,
  accept,
  current,
  initial,
  maxBytes = 5 * 1024 * 1024,
}: {
  kind: string;
  label: string;
  accept: string;
  /** The logo as uploaded before, or null. */
  current: string | null;
  initial: LogoCrop;
  maxBytes?: number;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [crop, setCrop] = useState<LogoCrop>(initial);
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);
  const { pending } = useFormStatus();
  const drag = useRef<{ x: number; y: number; start: LogoCrop; box: number } | null>(null);

  useEffect(() => () => void (chosen && URL.revokeObjectURL(chosen)), [chosen]);

  const src = chosen ?? current;
  const set = (next: Partial<LogoCrop>) => {
    setCrop((c) => normaliseCrop({ ...c, ...next }));
    setChanged(true);
  };

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError("");
    if (!file) {
      setChosen(null);
      return;
    }
    if (file.size > maxBytes) {
      event.target.value = "";
      setError(`Het logo is groter dan ${Math.round(maxBytes / 1024 / 1024)} MB.`);
      return;
    }
    setChosen(URL.createObjectURL(file));
    // A new logo starts edge to edge: a square logo then has no white border (the reason for this tool).
    setCrop({ ...DEFAULT_CROP, zoom: 1 });
    setChanged(true);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!src) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, start: crop, box: event.currentTarget.getBoundingClientRect().width };
  }
  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    set({ x: d.start.x + (event.clientX - d.x) / d.box, y: d.start.y + (event.clientY - d.y) / d.box });
  }
  const onPointerUp = () => void (drag.current = null);

  const step = (dx: number, dy: number) => set({ x: crop.x + dx, y: crop.y + dy });
  const size = `${crop.zoom * 100}%`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} id={id} type="file" name={kind} accept={accept} onChange={onFile} aria-label={label} className="min-w-0 max-w-full text-sm" />
        {changed && (
          <button type="button" disabled={pending} onClick={() => input.current?.form?.requestSubmit()} className="btn-primary px-3 py-1.5 text-sm">
            {pending ? "Opslaan…" : "Logo opslaan"}
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-bordeaux">{error}</p>}
      {src && (
        <div className="flex flex-wrap items-start gap-4">
          <div>
            <div
              role="img"
              aria-label="Uitsnede van het app-icoon. Sleep om het logo te verplaatsen."
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="relative h-36 w-36 cursor-grab touch-none overflow-hidden rounded-[22%] border border-line bg-white shadow-sm select-none active:cursor-grabbing"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- the logo, may be an SVG or a local preview */}
              <img
                src={src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute max-w-none object-contain"
                style={{ width: size, height: size, left: `calc(50% - ${crop.zoom * 50}% + ${crop.x * 100}%)`, top: `calc(50% - ${crop.zoom * 50}% + ${crop.y * 100}%)` }}
              />
            </div>
            <p className="mt-1 text-center text-xs text-muted">Uitsnede app-icoon</p>
          </div>
          <div className="min-w-[12rem] flex-1 space-y-2 text-sm">
            <label className="block">
              <span className="label">Grootte van het logo: {Math.round(crop.zoom * 100)}%</span>
              <input
                type="range"
                min={CROP_ZOOM.min}
                max={CROP_ZOOM.max}
                step={0.01}
                value={crop.zoom}
                onChange={(e) => set({ zoom: Number(e.target.value) })}
                className="w-full accent-[#6B1E2E]"
              />
            </label>
            <p className="text-xs text-muted">100% is van rand tot rand, dan is er geen witte rand. Meer snijdt het logo bij. Sleep het logo in het vierkant om het te verplaatsen.</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => step(0, -0.02)} className="btn-secondary px-2 py-1 text-xs" aria-label="Omhoog">↑</button>
              <button type="button" onClick={() => step(0, 0.02)} className="btn-secondary px-2 py-1 text-xs" aria-label="Omlaag">↓</button>
              <button type="button" onClick={() => step(-0.02, 0)} className="btn-secondary px-2 py-1 text-xs" aria-label="Naar links">←</button>
              <button type="button" onClick={() => step(0.02, 0)} className="btn-secondary px-2 py-1 text-xs" aria-label="Naar rechts">→</button>
              <button type="button" onClick={() => set({ zoom: 1, x: 0, y: 0 })} className="btn-secondary px-2 py-1 text-xs">Vullend</button>
              <button type="button" onClick={() => set({ ...DEFAULT_CROP })} className="btn-secondary px-2 py-1 text-xs">Met witte rand</button>
            </div>
          </div>
        </div>
      )}
      <input type="hidden" name={`crop-${kind}`} value={`${crop.zoom},${crop.x},${crop.y}`} />
    </div>
  );
}
