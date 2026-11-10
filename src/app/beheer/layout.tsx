import type { Metadata, Viewport } from "next";
import { AdminPwa } from "@/components/AdminPwa";
import { AppShell } from "@/components/AppShell";
import { requireOwner } from "@/lib/auth/session";
import { kickNotifications } from "@/lib/community/notify";
import { kickExpiryNotices } from "@/lib/academy-expiry";
import { menuCounts, viewerFor } from "@/lib/community/server";
import { devAuthAllowed } from "@/lib/auth/dev-mode";
import { openFeedbackRequestCount } from "@/lib/data/assignments";
import { sabineOpenCount } from "@/lib/ws/sabine-board";
import { followUpCount } from "@/lib/pipeline/server";
import { todayIso } from "@/lib/ws/format";

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
  const [counts, feedback, openTasks, followUps] = await Promise.all([
    menuCounts(await viewerFor(user)),
    openFeedbackRequestCount().catch(() => 0),
    sabineOpenCount().catch(() => 0),
    followUpCount(todayIso()).catch(() => 0),
  ]);
  kickNotifications();
  kickExpiryNotices();
  return (
    <AppShell
      userName={user.name}
      subtitle="Opleider"
      profileHref="/beheer/profiel"
      items={[
        // Everything on the Taken page: own tasks, open questions, assignments to summarise and feedback for students.
        { href: "/beheer/bruidsparen/takenbord", label: "Taken", badge: openTasks, strong: true },
        { href: "/beheer/bruidsparen/agenda", label: "Agenda", strong: true },
        // The badge: open leads whose next step is due today or earlier.
        { href: "/beheer/pipeline", label: "Pipeline", badge: followUps, strong: true },
        // Feedback Sabine: revenue per year or quarter and the open amounts of all couples.
        { href: "/beheer/omzet", label: "Omzet", sub: true },
        { href: "/beheer/community", label: "Community", section: "Communicatie", sectionBadge: counts.community + counts.private, badge: counts.community },
        { href: "/beheer/berichten", label: "Privéberichten", badge: counts.private },
        { href: "/beheer/bruidsparen", label: "Bruidsparen", section: "Your Wedding Space", exact: true, alsoActive: ["/beheer/bruidsparen/nieuw"] },
        { href: "/beheer/bruidsparen/opdrachten", label: "Opdrachten" },
        { href: "/beheer/bruidsparen/speeches", label: "Speeches" },
        // Cursist toevoegen and Feedback are reached from the Cursisten page; the open feedback shows as a count here.
        { href: "/beheer", label: "Cursisten", section: "Future Weddings Academy", badge: feedback, exact: true, alsoActive: ["/beheer/cursisten", "/beheer/feedback"] },
        { href: "/beheer/inhoud", label: "Lesinhoud" },
        { href: "/beheer/bruidsparen/pakketten", label: "Pakketten", section: "Diensten" },
        { href: "/beheer/bruidsparen/openingsdans", label: "Openingsdans" },
        { href: "/beheer/bruidsparen/aanraders", label: "Aanraders", group: true, strong: true },
        { href: "/beheer/instellingen", label: "Instellingen", section: "Systeem" },
        { href: "/beheer/rondleiding", label: "Rondleiding" },
        { href: "/beheer/bruidsparen/standaardlijsten", label: "Standaardlijsten" },
        { href: "/beheer/mailgeschiedenis", label: "Mailgeschiedenis" },
        { href: "/beheer/logboek", label: "Logboek" },
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
