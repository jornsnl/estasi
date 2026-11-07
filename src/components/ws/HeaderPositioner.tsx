"use client";

import { useRef, useState } from "react";

/**
 * Preview of the header photo over the full width, as guests see it. Drag
 * the photo up or down (or use the slider) to choose what stays in view.
 */
export function HeaderPositioner({ src, initial, name = "position" }: { src: string; initial: number; name?: string }) {
  const [position, setPosition] = useState(initial);
  const drag = useRef<{ y: number; start: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);

  const move = (clientY: number) => {
    if (!drag.current || !frame.current) return;
    // Dragging the photo down shows more of its top: the position goes down.
    const delta = ((clientY - drag.current.y) / frame.current.clientHeight) * 100;
    setPosition(Math.max(0, Math.min(100, Math.round(drag.current.start - delta))));
  };

  return (
    <div className="space-y-2">
      <div
        ref={frame}
        className="relative h-40 cursor-grab touch-none overflow-hidden rounded-xl bg-cream-deep select-none active:cursor-grabbing sm:h-48"
        onPointerDown={(e) => {
          drag.current = { y: e.clientY, start: position };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => move(e.clientY)}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- uploaded photo behind a login check */}
        <img src={src} alt="Headerfoto" draggable={false} className="pointer-events-none h-full w-full object-cover" style={{ objectPosition: `50% ${position}%` }} />
        <span className="absolute right-2 bottom-2 rounded-full bg-white/90 px-2 py-0.5 text-xs text-muted">Sleep om te verschuiven</span>
      </div>
      <label className="flex items-center gap-3 text-xs text-muted">
        Boven
        <input type="range" min={0} max={100} value={position} onChange={(e) => setPosition(Number(e.target.value))} className="flex-1 accent-[#6B1E2E]" aria-label="Positie van de foto" />
        Onder
      </label>
      <input type="hidden" name={name} value={position} />
    </div>
  );
}
