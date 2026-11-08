"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Fetches new messages now and then while the page is visible and nobody is typing. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const active = document.activeElement;
      // Never while writing: a refresh keeps the text, but it should not move the page.
      if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT")) return;
      router.refresh();
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
