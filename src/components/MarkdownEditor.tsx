"use client";

import { useRef } from "react";

type Action = "bold" | "italic" | "heading" | "list" | "numbered" | "link";

const BUTTONS: { action: Action; label: string; title: string; className?: string }[] = [
  { action: "bold", label: "B", title: "Vet", className: "font-bold" },
  { action: "italic", label: "I", title: "Cursief", className: "italic" },
  { action: "heading", label: "Kopje", title: "Kopje" },
  { action: "list", label: "• Opsomming", title: "Opsomming" },
  { action: "numbered", label: "1. Nummering", title: "Genummerde lijst" },
  { action: "link", label: "Link", title: "Link" },
];

/**
 * Text area with a small toolbar. The buttons write the same simple markup
 * (Markdown) the lesson page already understands, so nothing else changes.
 */
export function MarkdownEditor({ name, defaultValue, rows = 10, label }: { name: string; defaultValue: string; rows?: number; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function replace(area: HTMLTextAreaElement, start: number, end: number, text: string, select: [number, number]) {
    area.focus();
    area.setSelectionRange(start, end);
    // execCommand keeps undo (Ctrl+Z) working and fires the input event the unsaved-changes warning listens to.
    const ok = typeof document.execCommand === "function" && document.execCommand("insertText", false, text);
    if (!ok) {
      area.setRangeText(text, start, end, "end");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    }
    area.setSelectionRange(select[0], select[1]);
  }

  function apply(action: Action) {
    const area = ref.current;
    if (!area) return;
    const { selectionStart: start, selectionEnd: end, value } = area;
    const selected = value.slice(start, end);

    if (action === "bold" || action === "italic" || action === "link") {
      const fallback = action === "link" ? "linktekst" : "tekst";
      const inner = selected || fallback;
      const text = action === "bold" ? `**${inner}**` : action === "italic" ? `*${inner}*` : `[${inner}](https://)`;
      const offset = action === "bold" ? 2 : 1;
      // Select the placeholder text (or the URL for a link) so it can be typed over.
      const select: [number, number] =
        action === "link" ? [start + inner.length + 3, start + text.length - 1] : [start + offset, start + offset + inner.length];
      replace(area, start, end, text, select);
      return;
    }

    // Line based: heading and lists apply to every selected line.
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const nextBreak = value.indexOf("\n", end);
    const lineEnd = nextBreak === -1 ? value.length : nextBreak;
    const lines = value.slice(lineStart, lineEnd).split("\n");
    const strip = (line: string) => line.replace(/^(#{1,6}\s+|[-*]\s+|\d+\.\s+)/, "");
    const changed = lines.map((line, i) => {
      const base = strip(line);
      if (action === "heading") return line.startsWith("## ") ? base : `## ${base}`;
      if (action === "list") return /^[-*]\s+/.test(line) ? base : `- ${base}`;
      return /^\d+\.\s+/.test(line) ? base : `${i + 1}. ${base}`;
    });
    const text = changed.join("\n");
    replace(area, lineStart, lineEnd, text, [lineStart + text.length, lineStart + text.length]);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line focus-within:border-bordeaux">
      <div role="toolbar" aria-label="Tekstopmaak" className="flex flex-wrap gap-1 border-b border-line bg-cream/60 p-1.5">
        {BUTTONS.map((b) => (
          <button
            key={b.action}
            type="button"
            title={b.title}
            aria-label={b.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply(b.action)}
            className={`rounded-md px-2.5 py-1 text-sm text-ink hover:bg-white ${b.className ?? ""}`}
          >
            {b.label}
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        aria-label={label}
        className="block w-full resize-y border-0 bg-white p-3 text-sm leading-relaxed focus:outline-none"
      />
    </div>
  );
}
