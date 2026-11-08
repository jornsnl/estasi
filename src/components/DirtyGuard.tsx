"use client";

import { useEffect, useRef, useState } from "react";

const LEAVE_WARNING = "Er zijn wijzigingen die nog niet zijn opgeslagen. Weet je zeker dat je deze pagina wilt verlaten?";

/**
 * Warns before leaving the page with unsaved changes in the given form: when
 * closing or reloading the tab, and when clicking a link inside the app
 * (those navigate without a page load, so the browser itself does not ask).
 */
export function DirtyGuard({ formId, message = "Er zijn wijzigingen die nog niet zijn opgeslagen." }: { formId: string; message?: string }) {
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const submitting = useRef(false);

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    // Counts every field that belongs to the form, also one outside it with form="...",
    // and not a field inside it that belongs to another form.
    const onInput = (e: Event) => {
      if ((e.target as HTMLInputElement | null)?.form !== form) return;
      dirtyRef.current = true;
      setDirty(true);
    };
    const onSubmit = () => {
      submitting.current = true;
    };
    // After a server action React resets the form to the saved values: nothing unsaved any more.
    const onReset = () => {
      dirtyRef.current = false;
      submitting.current = false;
      setDirty(false);
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current && !submitting.current) e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || submitting.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // opens in a new tab
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      const samePage = url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search;
      if (samePage) return; // a jump to an anchor on this page
      if (!window.confirm(LEAVE_WARNING)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    form.addEventListener("submit", onSubmit);
    form.addEventListener("reset", onReset);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
      form.removeEventListener("submit", onSubmit);
      form.removeEventListener("reset", onReset);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [formId]);

  if (!dirty) return null;
  return <span role="status" className="text-sm text-bordeaux">{message}</span>;
}
