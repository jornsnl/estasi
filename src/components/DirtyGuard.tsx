"use client";

import { useEffect, useRef, useState } from "react";

/** Warns before leaving the page with unsaved answers in the given form. */
export function DirtyGuard({ formId }: { formId: string }) {
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const submitting = useRef(false);

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const onInput = () => {
      dirtyRef.current = true;
      setDirty(true);
    };
    const onSubmit = () => {
      submitting.current = true;
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current && !submitting.current) e.preventDefault();
    };
    form.addEventListener("input", onInput);
    form.addEventListener("change", onInput);
    form.addEventListener("submit", onSubmit);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      form.removeEventListener("input", onInput);
      form.removeEventListener("change", onInput);
      form.removeEventListener("submit", onSubmit);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [formId]);

  if (!dirty) return null;
  return <span className="text-sm text-bordeaux">Er zijn wijzigingen die nog niet zijn opgeslagen.</span>;
}
