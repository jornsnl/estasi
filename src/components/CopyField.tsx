"use client";

import { useState } from "react";

/** A read-only value with a copy button (server URL, client id, client secret). */
export function CopyField({ value, label, id }: { value: string; label: string; id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="flex gap-2">
        <input id={id} readOnly value={value} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="btn-secondary shrink-0"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Clipboard blocked: the field is selectable as a fallback.
            }
          }}
        >
          {copied ? "Gekopieerd" : "Kopiëren"}
        </button>
      </div>
    </div>
  );
}
