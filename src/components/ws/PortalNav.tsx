"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; exact?: boolean; icon?: "home" };

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

export function PortalNav({ items }: { items: Item[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Onderdelen" className="no-print -mx-1 flex items-center gap-1 overflow-x-auto pb-1">
      {items.map((item) => {
        const active = item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);
        if (item.icon === "home") {
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
              className="shrink-0 rounded-full p-1.5 text-bordeaux transition-colors hover:bg-white"
            >
              <HomeIcon filled={active} />
            </Link>
          );
        }
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
