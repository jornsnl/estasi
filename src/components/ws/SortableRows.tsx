"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * A list whose order Sabine changes by dragging the grip or with the arrow
 * buttons; every move is saved right away through `move`. The rows
 * themselves are rendered on the server and passed in.
 */
export function SortableRows({
  rows,
  move,
  label,
}: {
  rows: { id: string; node: React.ReactNode; dimmed?: boolean }[];
  move: (id: string, to: number) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** What is being ordered, for screen readers ("Pakketten"). */
  label: string;
}) {
  const router = useRouter();
  const [order, setOrder] = useState(rows.map((r) => r.id));
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [, start] = useTransition();
  // New rows from the server (added, deleted) replace the local order.
  const ids = rows.map((r) => r.id).join();
  const [seen, setSeen] = useState(ids);
  if (seen !== ids) {
    setSeen(ids);
    setOrder(rows.map((r) => r.id));
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const list = order.map((id) => byId.get(id)).filter((r): r is (typeof rows)[number] => Boolean(r));

  const go = (id: string, to: number) => {
    const from = order.indexOf(id);
    if (from === -1 || to < 0 || to >= order.length || to === from) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, id);
    const previous = order;
    setOrder(next);
    setStatus("Opslaan…");
    start(async () => {
      const result = await move(id, to);
      if (result.ok) {
        setStatus("Volgorde opgeslagen");
        router.refresh();
      } else {
        setOrder(previous);
        setStatus(result.error);
      }
    });
  };

  return (
    <div>
      <p className="sr-only" aria-live="polite">{status}</p>
      <ol aria-label={label} className="divide-y divide-line">
        {list.map((r, i) => (
          <li
            key={r.id}
            onDragOver={(e) => {
              if (!drag) return;
              e.preventDefault();
              setOver(i);
            }}
            onDragLeave={() => setOver((o) => (o === i ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              if (drag) go(drag, i);
              setDrag(null);
              setOver(null);
            }}
            className={`flex items-center gap-2 px-2 py-2 sm:px-3 ${r.dimmed ? "opacity-60" : ""} ${over === i && drag && drag !== r.id ? "bg-gold-soft/60" : ""} ${drag === r.id ? "opacity-40" : ""}`}
          >
            <span
              draggable
              onDragStart={(e) => {
                setDrag(r.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", r.id);
              }}
              onDragEnd={() => {
                setDrag(null);
                setOver(null);
              }}
              className="hidden cursor-grab select-none px-1 text-lg leading-none text-muted active:cursor-grabbing sm:inline"
              title="Slepen om de volgorde te veranderen"
              aria-hidden="true"
            >
              ⋮⋮
            </span>
            <span className="flex flex-col">
              <button type="button" disabled={i === 0} onClick={() => go(r.id, i - 1)} className="px-1.5 text-sm text-muted hover:text-bordeaux disabled:opacity-25" aria-label="Omhoog" title="Omhoog">↑</button>
              <button type="button" disabled={i === list.length - 1} onClick={() => go(r.id, i + 1)} className="px-1.5 text-sm text-muted hover:text-bordeaux disabled:opacity-25" aria-label="Omlaag" title="Omlaag">↓</button>
            </span>
            <div className="min-w-0 flex-1">{r.node}</div>
          </li>
        ))}
      </ol>
      {status && <p className="px-3 pb-2 text-xs text-muted" aria-hidden="true">{status}</p>}
    </div>
  );
}
