"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export interface NavItem {
  href: string;
  label: string;
  soon?: boolean;
  exact?: boolean;
  /** Starts a new group in the menu with this heading. Such a group folds open and closed. */
  section?: string;
  /** A count next to the heading of the group, always shown; without it a folded group shows the sum of the counts inside. */
  sectionBadge?: number;
  /** Starts a new group without a heading (just some space above). */
  group?: boolean;
  /** Unread count, shown as a small badge (not on the page you are on). */
  badge?: number;
  /** Bold, for a link that stands on its own instead of under a heading. */
  strong?: boolean;
  /** Other paths where this item counts as the current page (pages reached through tabs). */
  alsoActive?: string[];
  /** A sub page of the item above it, shown indented and smaller (for example Pipeline, Omzet). */
  sub?: boolean;
}

interface Block {
  section?: string;
  /** The heading's own count (always shown). */
  badge: number;
  /** The counts inside the group added up (shown on the heading while the group is folded). */
  inside: number;
  spaced: boolean;
  items: NavItem[];
}

const STORAGE_KEY = "menu-open-groups";

const Count = ({ n, label }: { n: number; label: string }) => (
  <span className="min-w-5 rounded-full bg-bordeaux px-1.5 text-center text-[11px] leading-5 font-semibold tracking-normal text-white normal-case">
    <span className="sr-only">, {label}: </span>
    {n > 9 ? "9+" : n}
  </span>
);

const matches = (pathname: string, href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
const isActive = (pathname: string, item: NavItem) => matches(pathname, item.href, item.exact) || (item.alsoActive ?? []).some((p) => matches(pathname, p));

/** Splits the menu into groups: a heading starts a foldable group, the rest stays as plain links. */
function blocks(items: NavItem[]): Block[] {
  const out: Block[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (item.section || item.group || !last) {
      out.push({ section: item.section, badge: item.sectionBadge ?? 0, inside: 0, spaced: out.length > 0, items: [item] });
    } else last.items.push(item);
  }
  for (const b of out) b.inside = b.items.reduce((n, i) => n + (i.badge ?? 0), 0);
  return out;
}

function readStored(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function store(open: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...open]));
  } catch {
    // Private mode or blocked storage: the menu simply starts folded next time.
  }
}

function Item({ item, active }: { item: NavItem; active: boolean }) {
  if (item.soon) {
    return (
      <span className="flex items-center justify-between rounded-md px-3 py-2 text-[15px] text-muted/70">
        {item.label}
        <span className="text-[10px] tracking-wider uppercase">Binnenkort</span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`block rounded-md border-l-2 transition-colors ${item.sub ? "py-1.5 pr-3 pl-7 text-[14px]" : "px-3 py-2 text-[15px]"} ${
        active ? "border-bordeaux bg-bordeaux-soft font-medium text-bordeaux" : `border-transparent text-ink hover:bg-cream ${item.strong ? "font-semibold" : ""}`
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        {item.label}
        {!active && item.badge ? <Count n={item.badge} label="ongelezen" /> : null}
      </span>
    </Link>
  );
}

/**
 * The menu. Groups with a heading start folded; the group of the page you
 * are on opens by itself, and what you open yourself stays open (per browser).
 */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const groups = blocks(items);
  const current = groups.find((g) => g.section && g.items.some((i) => isActive(pathname, i)))?.section;
  const [open, setOpen] = useState<Set<string>>(() => new Set(current ? [current] : []));

  // What was opened earlier in this browser (after the first render, so server and browser agree).
  useEffect(() => {
    const stored = readStored();
    if (stored.length) setOpen((o) => new Set([...o, ...stored]));
  }, []);

  // Going to a page in a folded group opens that group.
  useEffect(() => {
    if (current) setOpen((o) => (o.has(current) ? o : new Set([...o, current])));
  }, [current]);

  const toggle = (section: string) =>
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      store(next);
      return next;
    });

  return (
    <div>
      {groups.map((g, index) => {
        const list = (id?: string, hidden = false) => (
          <ul id={id} hidden={hidden} className="space-y-1">
            {g.items.map((item) => (
              <li key={item.href}>
                <Item item={item} active={!item.soon && isActive(pathname, item)} />
              </li>
            ))}
          </ul>
        );
        // Feedback: one thin line, only under the first links (Taken, Agenda); the groups below follow without lines.
        const divider = index === 1 ? <hr className="mx-3 mb-3 border-line" /> : null;
        if (!g.section) {
          return (
            <div key={`plain-${index}`} className={g.spaced ? "mt-3" : ""}>
              {divider}
              {list()}
            </div>
          );
        }
        const isOpen = open.has(g.section);
        const id = `menu-groep-${index}`;
        return (
          <div key={g.section} className={g.spaced ? (index === 1 ? "mt-3" : "mt-1") : ""}>
            {divider}
            {/* The same type as the plain links (Taken, Agenda), with a chevron so it shows that it folds open. */}
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={id}
              onClick={() => toggle(g.section!)}
              className="flex w-full items-center gap-2 rounded-md border-l-2 border-transparent px-3 py-2 text-left text-[15px] font-semibold text-ink hover:bg-cream"
            >
              <span className="flex-1">{g.section}</span>
              {(g.badge || (!isOpen && g.inside)) ? <Count n={g.badge || g.inside} label="open" /> : null}
              <svg viewBox="0 0 12 12" aria-hidden className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}>
                <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className={isOpen ? "mt-1 mb-2 pl-3" : ""}>{list(id, !isOpen)}</div>
          </div>
        );
      })}
    </div>
  );
}
