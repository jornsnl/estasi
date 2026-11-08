"use client";

import { useState, useTransition } from "react";
import { saveSupplierField } from "@/app/actions/ws-suppliers";

/**
 * "Aanwezig op locatie vanaf / tot" in the Leveranciers tab of the draaiboek:
 * the same fields as on Jullie leveranciers, saved when you leave them.
 */
export function SupplierTimes({ coupleId, supplierId, from, until, name }: { coupleId: string; supplierId: string; from: string; until: string; name: string }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [, start] = useTransition();
  const field = (key: "present_from" | "present_until", label: string, value: string) => (
    <label className="block text-[11px] text-muted">
      {label}
      <input
        type="time"
        defaultValue={value}
        aria-label={`Aanwezig op locatie ${label} (${name})`}
        onBlur={(e) => {
          const el = e.target;
          if (el.value === el.defaultValue) return;
          setState("saving");
          start(async () => {
            const result = await saveSupplierField(coupleId, supplierId, key, el.value);
            setState(result.ok ? "saved" : "error");
            setError(result.error ?? "");
            if (result.ok) el.defaultValue = el.value;
          });
        }}
        className="input mt-0.5 w-28 px-2 py-1 text-sm text-ink"
      />
    </label>
  );
  return (
    <div className="flex flex-wrap items-end gap-2">
      {field("present_from", "vanaf", from)}
      {field("present_until", "tot", until)}
      <span className="pb-1.5 text-[11px] text-muted" aria-live="polite">
        {state === "saving" ? "Opslaan…" : state === "saved" ? "✓" : state === "error" ? <span className="text-red-700">{error || "Niet opgeslagen"}</span> : ""}
      </span>
    </div>
  );
}
