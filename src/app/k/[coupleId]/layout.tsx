import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { PortalNav } from "@/components/ws/PortalNav";
import { touchActivity } from "@/lib/academy";
import { requireCouple } from "@/lib/ws/access";
import { coupleName } from "@/lib/ws/format";

export const dynamic = "force-dynamic";

const STATUS = { concept: "Concept: nog niet gedeeld", active: "Gedeeld met het bruidspaar", archived: "Gearchiveerd" } as const;

export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ coupleId: string }> }) {
  const { coupleId } = await params;
  const { couple, isAdmin, account, planning } = await requireCouple(coupleId);
  if (!isAdmin) await touchActivity(account);
  const base = `/k/${couple.id}`;
  // Only the opening dance: overview, appointments, the dance and invoices. Sabine always sees everything.
  const items = [
    { href: base, label: "Overzicht", exact: true, icon: "home" as const },
    ...(planning ? [{ href: `${base}/pakket`, label: "Jullie pakket" }, { href: `${base}/draaiboek`, label: "Draaiboek" }] : []),
    ...(planning && couple.suppliers_enabled ? [{ href: `${base}/leveranciers`, label: "Leveranciers" }] : []),
    { href: `${base}/afspraken`, label: "Afspraken" },
    ...(planning
      ? [
          { href: `${base}/gasten`, label: "Gastenlijst & RSVP" },
          { href: `${base}/eten`, label: "Eten" },
          { href: `${base}/styling`, label: "Styling" },
          { href: `${base}/opdrachten`, label: "Opdrachten" },
          { href: `${base}/kosten`, label: "Kosten" },
        ]
      : []),
    // Always there: without the dance in the package it is the information page (feedback 9.1).
    { href: `${base}/openingsdans`, label: "De openingsdans" },
    { href: `${base}/facturen`, label: "Facturen & Offertes" },
    ...(isAdmin ? [{ href: `${base}/gegevens`, label: "Gegevens & delen" }] : []),
  ];
  return (
    <div className="ws-theme">
      {isAdmin && (
        <div className="no-print bg-ink text-cream">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
            <Link href="/beheer/bruidsparen" className="hover:underline">← Alle bruidsparen</Link>
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
