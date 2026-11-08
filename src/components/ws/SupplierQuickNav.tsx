"use client";

import { useEffect, useState } from "react";

export interface QuickNavCategory {
  id: string;
  name: string;
  filled: boolean;
}

const sectionId = (id: string) => `c-${id}`;

function jump(id: string) {
  const el = document.getElementById(sectionId(id));
  if (!el) return;
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  history.replaceState(null, "", `#${sectionId(id)}`);
}

/** The category whose block is at the top part of the screen. */
function useActive(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? "");
  const key = ids.join(",");
  useEffect(() => {
    const list = key ? key.split(",") : [];
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id.slice(2), e.isIntersecting);
        const first = list.find((id) => visible.get(id));
        if (first) setActive(first);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    for (const id of list) {
      const el = document.getElementById(sectionId(id));
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [key]);
  return [active, setActive] as const;
}

function Dot({ filled }: { filled: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${filled ? "bg-gold" : "border border-muted/50 bg-transparent"}`}
    />
  );
}

/**
 * Quick menu on "Jullie leveranciers": a sticky list on the left on desktop,
 * a sticky "Ga naar categorie" dropdown on mobile. The dot shows whether the
 * category has been filled in.
 */
export function SupplierQuickNav({ categories }: { categories: QuickNavCategory[] }) {
  const [active, setActive] = useActive(categories.map((c) => c.id));
  const go = (id: string) => {
    setActive(id);
    jump(id);
  };

  return (
    <>
      <div className="sticky top-0 z-20 -mx-4 bg-cream/95 px-4 py-2 backdrop-blur lg:hidden">
        <label htmlFor="ga-naar-categorie" className="sr-only">Ga naar categorie</label>
        <select
          id="ga-naar-categorie"
          value=""
          onChange={(e) => e.target.value && go(e.target.value)}
          className="input py-2 text-sm"
        >
          <option value="">Ga naar categorie{active ? `: ${categories.find((c) => c.id === active)?.name ?? ""}` : ""}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.filled ? "● " : "○ "}{c.name}</option>
          ))}
        </select>
      </div>

      <nav aria-label="Snelmenu categorieën" className="hidden lg:block">
        <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1">
          <p className="eyebrow mb-2 px-2">Categorieën</p>
          <ul className="space-y-0.5 text-sm">
            {categories.map((c) => (
              <li key={c.id}>
                <a
                  href={`#${sectionId(c.id)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    go(c.id);
                  }}
                  aria-current={active === c.id ? "location" : undefined}
                  className={`flex items-center gap-2 rounded-md px-2 py-1 transition-colors ${
                    active === c.id ? "bg-bordeaux-soft font-medium text-bordeaux" : "text-muted hover:bg-white hover:text-ink"
                  }`}
                >
                  <Dot filled={c.filled} />
                  <span className="truncate">{c.name}</span>
                  <span className="sr-only">{c.filled ? " (ingevuld)" : " (nog niet ingevuld)"}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </>
  );
}
