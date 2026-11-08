import type { Metadata, Viewport } from "next";
import { AdminPwa } from "@/components/AdminPwa";
import { AppShell } from "@/components/AppShell";
import { requireOwner } from "@/lib/auth/session";
import { kickNotifications } from "@/lib/community/notify";
import { menuCounts, viewerFor } from "@/lib/community/server";
import { devAuthAllowed } from "@/lib/auth/dev-mode";

export const dynamic = "force-dynamic";

// Installable as a home screen app (see src/app/beheer.webmanifest). Only here, not for students or couples.
export const metadata: Metadata = {
  manifest: "/beheer.webmanifest",
  appleWebApp: { capable: true, title: "Estasi", statusBarStyle: "default" },
  applicationName: "Estasi Beheer",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOwner();
  const counts = await menuCounts(await viewerFor(user));
  kickNotifications();
  return (
    <AppShell
      userName={user.name}
      subtitle="Opleider"
      items={[
        { href: "/beheer", label: "Cursisten", exact: true, section: "Academy" },
        { href: "/beheer/cursisten/nieuw", label: "Cursist toevoegen" },
        { href: "/beheer/inhoud", label: "Lesinhoud" },
        { href: "/beheer/community", label: "Community", badge: counts.community },
        { href: "/beheer/berichten", label: "Privéberichten", badge: counts.private },
        { href: "/beheer/instellingen", label: "Instellingen" },
        { href: "/beheer/logboek", label: "Logboek" },
        { href: "/beheer/profiel", label: "Profiel en beveiliging" },
        { href: "/beheer/bruidsparen", label: "Bruidsparen", exact: true, section: "Your Wedding Space" },
        { href: "/beheer/bruidsparen/nieuw", label: "Nieuw bruidspaar" },
        { href: "/beheer/bruidsparen/takenbord", label: "Mijn takenbord" },
        { href: "/beheer/bruidsparen/agenda", label: "Mijn agenda" },
        { href: "/beheer/bruidsparen/pakketten", label: "Pakketten" },
        { href: "/beheer/bruidsparen/openingsdans", label: "Openingsdans" },
        { href: "/beheer/bruidsparen/speeches", label: "Speeches" },
        { href: "/beheer/bruidsparen/mails", label: "Mailgeschiedenis" },
        { href: "/beheer/bruidsparen/opdrachten", label: "Opdrachten" },
        { href: "/beheer/bruidsparen/aanraders", label: "Aanraders" },
        { href: "/beheer/bruidsparen/standaardlijsten", label: "Standaardlijsten" },
        { href: "/beheer/bruidsparen/instellingen", label: "Instellingen portaal" },
      ]}
      footer={
        devAuthAllowed() ? (
          <p className="rounded-lg bg-gold-soft p-3 text-xs text-gold-ink">Ontwikkelomgeving: lokale database, ontwikkel-login zonder Supabase</p>
        ) : undefined
      }
    >
      <AdminPwa />
      {children}
    </AppShell>
  );
}
