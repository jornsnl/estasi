import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { PortalNav } from "@/components/PortalNav";
import { requireCouple } from "@/lib/auth/access";
import { coupleName } from "@/lib/domain/format";

export const dynamic = "force-dynamic";

const STATUS = { concept: "Concept: nog niet gedeeld", active: "Gedeeld met het bruidspaar", archived: "Gearchiveerd" } as const;

export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ coupleId: string }> }) {
  const { coupleId } = await params;
  const { couple, isAdmin, account } = await requireCouple(coupleId);
  const base = `/k/${couple.id}`;
  const items = [
    { href: base, label: "Overzicht", exact: true },
    { href: `${base}/pakket`, label: "Jullie Pakket" },
    ...(couple.suppliers_enabled ? [{ href: `${base}/leveranciers`, label: "Leveranciers" }] : []),
    { href: `${base}/afspraken`, label: "Afspraken & deadlines" },
    { href: `${base}/kosten`, label: "Kostenoverzicht" },
    ...(isAdmin ? [{ href: `${base}/gegevens`, label: "Gegevens & delen" }] : []),
  ];
  return (
    <div className="min-h-screen">
      {isAdmin && (
        <div className="no-print bg-ink text-cream">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
            <Link href="/beheer" className="hover:underline">← Alle bruidsparen</Link>
            <span className={couple.status === "active" ? "text-[#cfe3b8]" : "text-[#e8ddb0]"}>
              Beheer · {coupleName(couple)} · {STATUS[couple.status]}
            </span>
          </div>
        </div>
      )}
      <header className="mx-auto max-w-5xl px-4 pt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Link href={base} className="leading-tight">
            <span className="block font-serif text-lg font-semibold">Estasi Weddings</span>
            <span className="eyebrow block text-[10px]">Your Wedding Space</span>
          </Link>
          <form action={logout} className="no-print flex items-center gap-3 text-sm text-muted">
            <span className="hidden sm:inline">{account.name}</span>
            <button type="submit" className="text-bordeaux hover:underline">Uitloggen</button>
          </form>
        </div>
        <PortalNav items={items} />
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-4 pb-16">{children}</main>
    </div>
  );
}
