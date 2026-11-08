import Link from "next/link";

/** The tabs of "Gastenlijst & RSVP". */
export function GuestTabs({ coupleId, current }: { coupleId: string; current: "gasten" | "uitnodigingen" | "formulieren" | "mails" }) {
  const base = `/k/${coupleId}/gasten`;
  const tabs = [
    { key: "gasten", href: base, label: "Gastenlijst" },
    { key: "uitnodigingen", href: `${base}/uitnodigingen`, label: "Uitnodigingslijst" },
    { key: "formulieren", href: `${base}/formulieren`, label: "Formulieren & QR-codes" },
    { key: "mails", href: `${base}/mails`, label: "Mailgeschiedenis" },
  ];
  return (
    <nav aria-label="Gastenlijst & RSVP" className="flex flex-wrap gap-2 text-sm">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={`rounded-full px-3.5 py-1.5 ${t.key === current ? "bg-bordeaux text-white" : "bg-white hover:bg-cream-deep"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
