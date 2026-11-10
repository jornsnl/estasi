import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { ExpiryBanner } from "@/components/academy/ExpiryBanner";
import { kickExpiryNotices } from "@/lib/academy-expiry";
import { kickNotifications } from "@/lib/community/notify";
import { menuCounts, viewerFor } from "@/lib/community/server";
import { PACKAGE_LABELS } from "@/lib/domain/labels";
import { touchActivity } from "@/lib/academy";
import { requireStudent } from "@/lib/auth/session";
import { metadataIcons } from "@/lib/brand-logo-urls";
import { mustChangePassword } from "@/lib/auth/temporary-password";
import { redirect } from "next/navigation";
import { getStore } from "@/lib/data";
import { unseenFeedback } from "@/lib/data/assignments";

export const dynamic = "force-dynamic";

// Installable on the home screen, needed for push notifications on iPhone (see src/app/academy.webmanifest).
export const metadata: Metadata = {
  manifest: "/academy.webmanifest",
  icons: metadataIcons("academy"),
  appleWebApp: { capable: true, title: "Academy", statusBarStyle: "default" },
};

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStudent();
  // Signed in with a temporary password from Sabine: choose an own one first.
  if (await mustChangePassword(user.id)) redirect("/wachtwoord-instellen");
  await touchActivity(user);
  const [settings, enrollment] = await Promise.all([getStore().getSettings(), getStore().getEnrollmentForUser(user.id)]);
  const [counts, newFeedback] = await Promise.all([
    menuCounts(await viewerFor(user)),
    unseenFeedback(user.id).catch(() => []),
  ]);
  kickNotifications();
  kickExpiryNotices();

  return (
    <AppShell
      userName={user.name}
      subtitle={enrollment ? `Pakket ${PACKAGE_LABELS[enrollment.package]}` : "Cursist"}
      items={[
        { href: "/dashboard", label: "Dashboard" },
        // New feedback from Sabine: the badge goes once the student opens the lesson.
        { href: "/opleiding", label: "Mijn opleiding", badge: newFeedback.length },
        { href: "/portfolio", label: "Mijn portfolio" },
        { href: "/community", label: "Community", badge: counts.community },
        { href: "/prive-chat", label: "Privéchat", badge: counts.private },
        { href: "/profiel", label: "Mijn profiel" },
        ...(enrollment?.certificateReleasedAt || enrollment?.practicalCertificateReleasedAt
          ? [{ href: enrollment.certificateReleasedAt ? "/certificaat" : "/certificaat/praktijk", label: "Certificaat" }]
          : []),
      ]}
      footer={
        <div className="rounded-lg bg-cream p-3 text-sm">
          <p className="font-medium text-ink">Vraag of probleem?</p>
          <a href={`mailto:${settings.contactEmail}`} className="break-all text-bordeaux hover:underline">
            {settings.contactEmail}
          </a>
        </div>
      }
    >
      <ExpiryBanner enrollment={enrollment} contactEmail={settings.contactEmail} />
      {children}
    </AppShell>
  );
}
