"use client";

import { useEffect } from "react";

/** Opens the print dialog once the page (and its images) has loaded. */
export function AutoPrint() {
  useEffect(() => {
    const go = () => setTimeout(() => window.print(), 300);
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
  }, []);
  return null;
}
