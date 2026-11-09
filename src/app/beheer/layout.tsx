import type { Metadata, Viewport } from "next";
import { AdminPwa } from "@/components/AdminPwa";
import { AppShell } from "@/components/AppShell";
import { requireOwner } from "@/lib/auth/session";
import { kickNotifications } from "@/lib/community/notify";
import { kickExpiryNotices } from "@/lib/academy-expiry";
import { menuCounts, viewerFor } from "@/lib/community/server";
import { devAuthAllowed } from "@/lib/auth/dev-mode";
import { openFeedbackRequestCount } from "@/lib/data/assignments";
import { one } from "@/lib/ws/db";

export const dynamic = "force-dynamic";

// Installable as a home screen app (see src/app/beheer.webmanifest). Only here, not for students or couples.
export const metadata: Metadata = {
  manifest: "/beheer.webmanifest",
  appleWebApp: { capable: true, title: "Estasi", statusBarStyle: "default" },
  applicationName: "Estasi Beheer",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#ffffff" };

/** Sabine's open tasks over all couples that are not archived, the same as on her task board. */
async function openSabineTaskCount(): Promise<number> {
  const row = await one<{ n: number }>(
    "select count(*)::int as n from tasks t join couples c on c.id = t.couple_id where t.lane = 'sabine' and t.done_at is null and c.status <> 'archived'",
  );
  return row?.n ?? 0;
}

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOwner();
  const [counts, feedback, openTasks] = await Promise.all([
    menuCounts(await viewerFor(user)),
    openFeedbackRequestCount().catch(() => 0),
    openSabineTaskCount().catch(() => 0),
  ]);
  kickNotifications();
  kickExpiryNotices();
  return (
    <AppShell
      userName={user.name}
      subtitle="Opleider"
      profileHref="/beheer/profiel"
      items={[
        { href: "/beheer/bruidsparen/takenbord", label: "Taken", badge: openTasks, strong: true },
        { href: "/beheer/bruidsparen/agenda", label: "Agenda", strong: true },
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
