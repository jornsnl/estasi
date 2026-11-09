"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Item = { href: string; label: string; exact?: boolean; icon?: "home" };

/** Remembers (per browser) that the bar already showed its one-time scroll hint. */
const HINT_KEY = "ws-portalnav-hint";
/** Room kept free at each edge for the fade and the arrow button. */
const EDGE = 36;

/** A house in bordeaux, line drawing with a small heart; filled on the overview itself. */
function HomeIcon({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M3.5 10.5 12 3.5l8.5 7V20a.5.5 0 0 1-.5.5h-15a.5.5 0 0 1-.5-.5z" />
      <path
        d="M12 17.2s-3-1.8-3-3.7a1.6 1.6 0 0 1 3-.8 1.6 1.6 0 0 1 3 .8c0 1.9-3 3.7-3 3.7z"
        fill={filled ? "#ffffff" : "none"}
        stroke={filled ? "#ffffff" : "currentColor"}
        strokeWidth="1.4"
      />
    </svg>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "right" ? "M7.5 4.5 13 10l-5.5 5.5" : "M12.5 4.5 7 10l5.5 5.5"} />
    </svg>
  );
}

const isActive = (item: Item, path: string) => (item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`));

/**
 * The portal menu. The home icon stays put on the left; the other items scroll
 * sideways (swipe, trackpad, keyboard or the gold arrow buttons). A soft fade and
 * an arrow show on each side where items are still out of view.
 */
export function PortalNav({ items }: { items: Item[] }) {
  const path = usePathname();
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  // Phone: a dropdown instead of the sideways scrolling bar (feedback).
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => setMenuOpen(false), [path]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  const home = items.find((i) => i.icon === "home");
  const rest = items.filter((i) => i.icon !== "home");

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft < max - 2 });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // Bring the active item into view (centered when it was outside the visible part).
  useEffect(() => {
    const el = scroller.current;
    const active = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !active) return;
    const box = el.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    if (item.left < box.left + EDGE || item.right > box.right - EDGE) {
      el.scrollLeft += item.left - box.left - (box.width - item.width) / 2;
    }
    measure();
  }, [path, measure]);

  // A focused item (Tab or arrow keys) is never hidden under the fade or an arrow button.
  const onFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const el = scroller.current;
    const target = e.target as HTMLElement;
    if (!el || target === el) return;
    const box = el.getBoundingClientRect();
    const item = target.getBoundingClientRect();
    if (item.left < box.left + EDGE) el.scrollLeft -= box.left + EDGE - item.left;
    else if (item.right > box.right - EDGE) el.scrollLeft += item.right - (box.right - EDGE);
  };

  // One-time nudge on the first visit: slide a little and back, so it is clear the bar scrolls.
  useEffect(() => {
    const el = scroller.current;
    if (!el || el.scrollWidth <= el.clientWidth + 2) return;
    try {
      if (window.localStorage.getItem(HINT_KEY)) return;
      window.localStorage.setItem(HINT_KEY, "1");
    } catch {
      return;
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const start = el.scrollLeft;
    const room = el.scrollWidth - el.clientWidth - start;
    if (room < 8) return;
    const t1 = window.setTimeout(() => el.scrollTo({ left: start + Math.min(80, room), behavior: "smooth" }), 500);
    const t2 = window.setTimeout(() => el.scrollTo({ left: start, behavior: "smooth" }), 1100);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  const scrollByPage = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.6), behavior: "smooth" });
  };

  // Arrow keys move between menu items; the browser keeps the focused item in view.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    const links = Array.from(e.currentTarget.querySelectorAll<HTMLAnchorElement>("a"));
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (at < 0) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? links.length - 1 : Math.min(links.length - 1, Math.max(0, at + (e.key === "ArrowRight" ? 1 : -1)));
    links[next]?.focus();
  };

  return (
    <nav aria-label="Onderdelen" className="no-print -mx-1 flex items-center pb-1">
      {home && (
        <div className="flex shrink-0 items-center border-r border-line pr-1.5 mr-1">
          <Link
            href={home.href}
            aria-current={isActive(home, path) ? "page" : undefined}
            aria-label={home.label}
            title={home.label}
            className="shrink-0 rounded-full p-1.5 text-bordeaux transition-colors hover:bg-white"
          >
            <HomeIcon filled={isActive(home, path)} />
          </Link>
        </div>
      )}
      <div ref={menuRef} className="relative min-w-0 flex-1 md:hidden">
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="portaal-menu"
          onClick={() => setMenuOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium shadow-sm"
        >
          <span className="truncate">{rest.find((i) => isActive(i, path))?.label ?? "Menu"}</span>
          <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 text-bordeaux transition-transform ${menuOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 7.5 10 12.5 15 7.5" />
          </svg>
        </button>
        {menuOpen && (
          <ul id="portaal-menu" className="absolute inset-x-0 top-full z-30 mt-1 max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-lg">
            {rest.map((item) => {
              const active = isActive(item, path);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-xl px-3.5 py-2.5 text-[15px] ${active ? "bg-bordeaux text-white" : "text-ink hover:bg-cream"}`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="relative hidden min-w-0 flex-1 md:block">
        <div ref={scroller} onKeyDown={onKeyDown} onFocus={onFocus} className="ws-nav-scroll flex items-center gap-1 overflow-x-auto px-0.5 py-0.5 overscroll-x-contain">
          {rest.map((item) => {
            const active = isActive(item, path);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                  active ? "bg-bordeaux text-white" : "text-ink hover:bg-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-cream to-transparent transition-opacity duration-200 ${edges.left ? "opacity-100" : "opacity-0"}`}
        />
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-cream to-transparent transition-opacity duration-200 ${edges.right ? "opacity-100" : "opacity-0"}`}
        />
        {edges.left && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Terug scrollen"
            onClick={() => scrollByPage(-1)}
            className="absolute left-0 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-gold text-white shadow-sm transition-colors hover:bg-gold-ink"
          >
            <Chevron dir="left" />
          </button>
        )}
        {edges.right && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Verder scrollen"
            onClick={() => scrollByPage(1)}
            className="absolute right-0 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-gold text-white shadow-sm transition-colors hover:bg-gold-ink"
          >
            <Chevron dir="right" />
          </button>
        )}
      </div>
    </nav>
  );
}
