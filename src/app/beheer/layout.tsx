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
        { href: "/beheer", label: "Cursisten", exact: true, section: "Academy" },
        { href: "/beheer/cursisten/nieuw", label: "Cursist toevoegen" },
        { href: "/beheer/inhoud", label: "Lesinhoud" },
        { href: "/beheer/instellingen", label: "Instellingen" },
        { href: "/beheer/logboek", label: "Logboek" },
        { href: "/beheer/bruidsparen", label: "Bruidsparen", exact: true, section: "Your Wedding Space" },
        { href: "/beheer/bruidsparen/nieuw", label: "Nieuw bruidspaar" },
        { href: "/beheer/bruidsparen/takenbord", label: "Mijn takenbord" },
        { href: "/beheer/bruidsparen/agenda", label: "Mijn agenda" },
        { href: "/beheer/bruidsparen/pakketten", label: "Pakketten" },
        { href: "/beheer/bruidsparen/opdrachten", label: "Opdrachten" },
        { href: "/beheer/bruidsparen/aanraders", label: "Aanraders" },
        { href: "/beheer/bruidsparen/standaardlijsten", label: "Standaardlijsten" },
        { href: "/beheer/bruidsparen/instellingen", label: "Instellingen portaal" },
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
