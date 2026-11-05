"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function PortalNav({ items }: { items: { href: string; label: string; exact?: boolean }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Onderdelen" className="no-print -mx-1 flex gap-1 overflow-x-auto pb-1">
      {items.map((item) => {
        const active = item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
              active ? "bg-bordeaux text-white" : "text-ink hover:bg-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
