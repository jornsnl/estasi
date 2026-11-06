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
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, []);
  useEffect(fit, [fit]);
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
