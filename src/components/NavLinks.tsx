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
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const heading = item.section ? (
          <p className="mt-5 mb-1 px-3 text-[11px] font-semibold tracking-[0.14em] text-gold-ink uppercase">{item.section}</p>
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
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            {heading}
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`block rounded-md border-l-2 px-3 py-2 text-[15px] transition-colors ${
                active
                  ? "border-bordeaux bg-bordeaux-soft font-medium text-bordeaux"
                  : "border-transparent text-ink hover:bg-cream"
              }`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
