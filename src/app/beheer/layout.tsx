import { AppShell } from "@/components/AppShell";
import { requireOwner } from "@/lib/auth/session";
import { isLocalMode } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOwner();
  return (
    <AppShell
      userName={user.name}
      subtitle="Opleider"
      items={[
        { href: "/beheer", label: "Cursisten", exact: true },
        { href: "/beheer/cursisten/nieuw", label: "Cursist toevoegen" },
        { href: "/beheer/inhoud", label: "Lesinhoud" },
        { href: "/beheer/instellingen", label: "Instellingen" },
        { href: "/beheer/logboek", label: "Logboek" },
      ]}
      footer={
        isLocalMode() ? (
          <p className="rounded-lg bg-gold-soft p-3 text-xs text-gold-ink">Lokale modus: gegevens staan in .data/db.json</p>
        ) : undefined
      }
    >
      {children}
    </AppShell>
  );
}
