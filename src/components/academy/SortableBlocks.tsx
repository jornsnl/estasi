"use client";

import { useRef, useState } from "react";

/**
 * The blocks of the lesson editor, in an order Sabine changes by dragging
 * the grip or with the arrows. Nothing is sent on a move: the new order goes
 * along in the hidden field "blockOrder" with the next save, like every other
 * edit in the lesson form. The block cards themselves are rendered on the
 * server and passed in.
 */
export function SortableBlocks({
  items,
  formId,
}: {
  items: { id: string; label: string; node: React.ReactNode }[];
  formId: string;
}) {
  const [order, setOrder] = useState(items.map((i) => i.id));
  const ids = items.map((i) => i.id).join();
  const [seen, setSeen] = useState(ids);
  if (seen !== ids) {
    // Blocks added or removed on the server: start from the saved order.
    setSeen(ids);
    setOrder(items.map((i) => i.id));
  }
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const byId = new Map(items.map((i) => [i.id, i]));
  const list = order.map((id) => byId.get(id)).filter((i): i is (typeof items)[number] => Boolean(i));

  const move = (id: string, to: number) => {
    const from = order.indexOf(id);
    if (from === -1 || to < 0 || to >= order.length || to === from) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, id);
    setOrder(next);
    setStatus(`${byId.get(id)?.label ?? "Blok"} staat nu op plek ${to + 1}. Sla de les op om de volgorde te bewaren.`);
    // The unsaved-changes warning listens to input events on the form's fields.
    queueMicrotask(() => field.current?.dispatchEvent(new Event("input", { bubbles: true })));
  };

  return (
    <div>
      <input ref={field} type="hidden" name="blockOrder" value={order.join(",")} form={formId} />
      <p className="sr-only" aria-live="polite">{status}</p>
      <ol className="space-y-4" aria-label="Blokken van de les">
        {list.map((item, i) => (
          <li
            key={item.id}
            // Capture phase: a text editor inside the card must not take the drop (it would paste the id).
            onDragOverCapture={(e) => {
              if (!drag) return;
              e.preventDefault();
              e.stopPropagation();
              setOver(i);
            }}
            onDragLeave={() => setOver((o) => (o === i ? null : o))}
            onDropCapture={(e) => {
              if (!drag) return;
              e.preventDefault();
              e.stopPropagation();
              move(drag, i);
              setDrag(null);
              setOver(null);
            }}
            className={`relative rounded-xl transition ${over === i && drag && drag !== item.id ? "ring-2 ring-gold" : ""} ${drag === item.id ? "opacity-40" : ""}`}
          >
            <div className="absolute right-3 top-3 z-[1] flex items-center gap-0.5 sm:right-4 sm:top-4">
              <span
                draggable
                onDragStart={(e) => {
                  setDrag(item.id);
                  e.dataTransfer.effectAllowed = "move";
                  // A type of our own, so no editor treats it as text to paste.
                  e.dataTransfer.setData("application/x-lesblok", item.id);
                  // Show the whole card while dragging, not just the grip.
                  const card = (e.currentTarget as HTMLElement).closest("li");
                  if (card) e.dataTransfer.setDragImage(card, 24, 24);
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setOver(null);
                }}
                className="hidden cursor-grab select-none px-1.5 text-lg leading-none text-muted active:cursor-grabbing sm:inline"
                title="Slepen om de volgorde te veranderen"
                aria-hidden="true"
              >
                ⋮⋮
              </span>
              <button type="button" disabled={i === 0} onClick={() => move(item.id, i - 1)} className="btn-ghost px-2 py-1.5 disabled:opacity-25" aria-label={`${item.label} omhoog`} title="Omhoog">↑</button>
              <button type="button" disabled={i === list.length - 1} onClick={() => move(item.id, i + 1)} className="btn-ghost px-2 py-1.5 disabled:opacity-25" aria-label={`${item.label} omlaag`} title="Omlaag">↓</button>
            </div>
            {item.node}
          </li>
        ))}
      </ol>
    </div>
  );
}
