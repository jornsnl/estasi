"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

// useLayoutEffect warns during server rendering; there is nothing to measure there anyway.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A textarea that grows with its text, so nothing is cut off; line breaks
 * stay as typed. Used for every long text field in Your Wedding Space.
 */
export function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Measured on its own: in a table row the field may be stretched to the
    // height of a taller cell next to it, and that height must not stick
    // once the other cell shrinks. Only a minimum height is set, so the
    // field still stretches with its row; each row keeps its own height.
    const { flex, height, alignSelf } = el.style;
    el.style.minHeight = "0px";
    el.style.flex = "none";
    el.style.alignSelf = "flex-start";
    el.style.height = "0px";
    const css = getComputedStyle(el);
    const needed = el.scrollHeight + parseFloat(css.borderTopWidth || "0") + parseFloat(css.borderBottomWidth || "0");
    el.style.flex = flex;
    el.style.alignSelf = alignSelf;
    el.style.height = height;
    el.style.minHeight = `${Math.ceil(needed)}px`;
  }, []);
  useIsoLayoutEffect(fit, [fit, props.value]);
  // A different width (window, columns) wraps the text differently.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    observer.observe(el);
    // Web fonts that arrive later wrap the text differently too.
    let alive = true;
    document.fonts?.ready.then(() => alive && fit());
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [fit]);
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
