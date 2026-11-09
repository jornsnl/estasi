"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";

export function MobileMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close after navigating.
  useEffect(() => setOpen(false), [pathname]);

  // While the menu is open the page behind it stays put, so a swipe scrolls the menu and not the page.
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white px-4 py-3">
        <Logo compact />
        <button
          type="button"
          className="btn-ghost"
          aria-expanded={open}
          aria-controls="mobiel-menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Sluiten" : "Menu"}
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 flex h-dvh">
          <button type="button" aria-label="Menu sluiten" className="flex-1 bg-ink/30" onClick={() => setOpen(false)} />
          <div id="mobiel-menu" className="order-first h-dvh w-72 max-w-[85vw] overflow-y-auto overscroll-contain bg-white shadow-xl">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
