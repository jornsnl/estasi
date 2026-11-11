"use client";

import { useRef } from "react";
import { toggleInlineMark, type InlineMark } from "@/lib/domain/inline-format";

const BUTTONS: { mark: InlineMark; label: string; title: string; className: string }[] = [
  { mark: "bold", label: "B", title: "Vet (Ctrl+B)", className: "font-bold" },
  { mark: "italic", label: "I", title: "Schuin (Ctrl+I)", className: "italic" },
  { mark: "underline", label: "U", title: "Onderstrepen (Ctrl+U)", className: "underline" },
];

const SHORTCUTS: Record<string, InlineMark> = { b: "bold", i: "italic", u: "underline" };

/**
 * A writing field of lesson content with buttons for bold, italic and underline (feedback
 * Sabine: in every writing block she chooses the formatting herself). Works as a normal
 * textarea, controlled (value and onChange, the assignment editor) or not (defaultValue and
 * name, the learning goals). The buttons write the markers of src/lib/domain/inline-format.ts.
 */
export function FormatTextarea({
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function apply(mark: InlineMark) {
    const area = ref.current;
    if (!area) return;
    const change = toggleInlineMark(area.value, area.selectionStart, area.selectionEnd, mark);
    if (props.maxLength && area.value.length - (change.replaceTo - change.replaceFrom) + change.text.length > props.maxLength) return;
    area.focus();
    area.setSelectionRange(change.replaceFrom, change.replaceTo);
    // execCommand keeps undo (Ctrl+Z) working and fires the input event React and the unsaved-changes warning listen to.
    const ok = typeof document.execCommand === "function" && document.execCommand("insertText", false, change.text);
    if (!ok) {
      area.setRangeText(change.text, change.replaceFrom, change.replaceTo, "end");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    }
    area.setSelectionRange(change.from, change.to);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white focus-within:border-bordeaux">
      <div role="toolbar" aria-label="Tekstopmaak" className="flex gap-1 border-b border-line bg-cream/60 px-1.5 py-1">
        {BUTTONS.map((b) => (
          <button
            key={b.mark}
            type="button"
            title={b.title}
            aria-label={b.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply(b.mark)}
            className={`h-7 w-7 rounded-md text-sm text-ink hover:bg-white ${b.className}`}
          >
            {b.label}
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        {...props}
        onKeyDown={(e) => {
          props.onKeyDown?.(e);
          if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
          const mark = SHORTCUTS[e.key.toLowerCase()];
          if (!mark) return;
          e.preventDefault();
          apply(mark);
        }}
        className={`block w-full resize-y border-0 bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none ${className}`}
      />
    </div>
  );
}
