"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * A textarea that grows with its text, so nothing is cut off; line breaks
 * stay as typed. Used for every long text field in Your Wedding Space.
 */
export function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // A minimum height, not a fixed one: in a table row the field can still
    // stretch to the height of the tallest cell next to it.
    el.style.minHeight = "0px";
    el.style.height = "auto";
    const needed = el.scrollHeight + 2;
    el.style.height = "";
    el.style.minHeight = `${needed}px`;
  }, []);
  useEffect(fit, [fit, props.value]);
  return (
    <textarea
      rows={1}
      {...props}
      ref={ref}
      onInput={(e) => {
        fit();
        props.onInput?.(e);
      }}
      style={{ resize: "none", overflow: "hidden", ...props.style }}
    />
  );
}
