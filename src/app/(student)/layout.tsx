import { AppShell } from "@/components/AppShell";
import { touchActivity } from "@/lib/academy";
import { requireStudent } from "@/lib/auth/session";
import { getStore } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStudent();
  await touchActivity(user);
  const [settings, enrollment] = await Promise.all([getStore().getSettings(), getStore().getEnrollmentForUser(user.id)]);

  return (
    <AppShell
      userName={user.name}
      subtitle={enrollment ? `Pakket ${enrollment.package === "A" ? "Online" : "Online + praktijk"}` : "Cursist"}
      items={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/opleiding", label: "Mijn opleiding" },
        { href: "/community", label: "Community", soon: true },
        { href: "/prive-chat", label: "Privéchat", soon: true },
        { href: "/profiel", label: "Mijn profiel" },
        ...(enrollment?.certificateReleasedAt ? [{ href: "/certificaat", label: "Certificaat" }] : []),
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
      {children}
    </AppShell>
  );
}
