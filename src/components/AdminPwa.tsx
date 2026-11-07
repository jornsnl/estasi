"use client";

import { useEffect } from "react";

/** Registers the service worker of the installed admin app (offline screen only, no page cache). */
export function AdminPwa() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/beheer-sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}
