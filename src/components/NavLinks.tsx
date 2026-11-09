"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  soon?: boolean;
  exact?: boolean;
  /** Starts a new group in the menu with this heading. */
  section?: string;
  /** A count next to the heading of the group (for example unread messages in the whole group). */
  sectionBadge?: number;
  /** Starts a new group without a heading (just some space above). */
  group?: boolean;
  /** Unread count, shown as a small badge (not on the page you are on). */
  badge?: number;
  /** Bold, for a link that stands on its own instead of under a heading. */
  strong?: boolean;
  /** Other paths where this item counts as the current page (pages reached through tabs). */
  alsoActive?: string[];
}

const Count = ({ n, label }: { n: number; label: string }) => (
  <span className="min-w-5 rounded-full bg-bordeaux px-1.5 text-center text-[11px] leading-5 font-semibold text-white normal-case tracking-normal">
    <span className="sr-only">, {label}: </span>
    {n > 9 ? "9+" : n}
  </span>
);

const matches = (pathname: string, href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-1">
      {items.map((item, index) => {
        const heading = item.section ? (
          <p className="mt-5 mb-1 flex items-center justify-between gap-2 px-3 text-[11px] font-semibold tracking-[0.14em] text-gold-ink uppercase">
            {item.section}
            {item.sectionBadge ? <Count n={item.sectionBadge} label="ongelezen" /> : null}
          </p>
        ) : item.group && index > 0 ? (
          <div className="mt-5" aria-hidden />
        ) : null;
        if (item.soon) {
          return (
            <li key={item.label}>
              {heading}
              <span className="flex items-center justify-between rounded-md px-3 py-2 text-[15px] text-muted/70">
                {item.label}
                <span className="text-[10px] tracking-wider uppercase">Binnenkort</span>
              </span>
            </li>
          );
        }
        const active = matches(pathname, item.href, item.exact) || (item.alsoActive ?? []).some((p) => matches(pathname, p));
        return (
          <li key={item.href}>
            {heading}
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`block rounded-md border-l-2 px-3 py-2 text-[15px] transition-colors ${
                active
                  ? "border-bordeaux bg-bordeaux-soft font-medium text-bordeaux"
                  : `border-transparent text-ink hover:bg-cream ${item.strong ? "font-semibold" : ""}`
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                {item.label}
                {!active && item.badge ? <Count n={item.badge} label="ongelezen" /> : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
