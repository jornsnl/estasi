import Link from "next/link";

const TABS = [
  { key: "algemeen", href: "/beheer/instellingen", label: "Algemeen" },
  { key: "maillog", href: "/beheer/instellingen/maillog", label: "Maillog" },
] as const;

/** The tabs on top of Beheer, Instellingen. */
export function SettingsTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Instellingen" className="mb-8 flex gap-1 border-b border-line">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
            t.key === active ? "border-bordeaux text-bordeaux" : "border-transparent text-muted hover:text-bordeaux"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
