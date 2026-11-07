"use client";

import { useState } from "react";

/**
 * A list of rows with the same fields (songs, videos). Every field is a
 * plain input named after its column, so the server reads them in order.
 */
export function RepeatRows({
  fields,
  initial,
  addLabel,
  max = 20,
}: {
  fields: { name: string; label: string; wide?: boolean; type?: string }[];
  initial: Record<string, string>[];
  addLabel: string;
  max?: number;
}) {
  const [rows, setRows] = useState(() => (initial.length ? initial : [{}]).map((r, i) => ({ key: i, values: r })));
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.key} className="grid gap-2 rounded-xl bg-cream p-3 sm:grid-cols-[1fr_1fr_auto]">
          {fields.map((f) => (
            <input
              key={f.name}
              name={f.name}
              type={f.type ?? "text"}
              defaultValue={row.values[f.name] ?? ""}
              placeholder={f.label}
              aria-label={f.label}
              className={`input py-1.5 ${f.wide ? "sm:col-span-2" : ""}`}
            />
          ))}
          <button type="button" onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))} className="self-center px-2 text-sm text-muted hover:text-bordeaux sm:row-start-1 sm:col-start-3" aria-label="Weghalen">×</button>
        </div>
      ))}
      {rows.length < max && (
        <button type="button" onClick={() => setRows((r) => [...r, { key: Date.now(), values: {} }])} className="text-sm text-bordeaux">+ {addLabel}</button>
      )}
    </div>
  );
}
