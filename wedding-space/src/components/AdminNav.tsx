"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/beheer", label: "Bruidsparen", exact: true },
  { href: "/beheer/takenbord", label: "Mijn takenbord" },
  { href: "/beheer/agenda", label: "Mijn agenda" },
  { href: "/beheer/pakketten", label: "Pakketten" },
  { href: "/beheer/instellingen", label: "Instellingen" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Beheer" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
      {ITEMS.map((item) => {
        const active = item.exact ? path === item.href : path.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm ${active ? "bg-bordeaux text-white" : "text-ink hover:bg-white"}`}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
