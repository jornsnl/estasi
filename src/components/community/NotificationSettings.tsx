import { saveNotificationSettings } from "@/app/actions/community";
import { SubmitButton } from "@/components/SubmitButton";
import { pushConfigured, vapidPublicKey } from "@/lib/community/push";
import { member } from "@/lib/community/server";
import { PushToggle } from "./PushToggle";

/** On the profile (student and Sabine): mail about the community and private messages, push per device. */
export async function NotificationSettings({ userId, owner = false }: { userId: string; owner?: boolean }) {
  const settings = await member(userId);
  return (
    <section id="meldingen" className="card scroll-mt-6 space-y-4 p-6">
      <div>
        <h2 className="text-2xl">Meldingen van de community</h2>
        <p className="mt-1 text-sm text-muted">
          {owner
            ? "Een mail bij nieuwe berichten in de community (hoogstens één per uur) en bij privéberichten van cursisten (hoogstens één per kwartier). Meldingen van cursisten krijg je altijd meteen."
            : "Een mail bij nieuwe berichten in de community (hoogstens één per uur) en bij een privébericht van Sabine (hoogstens één per kwartier). In de mail staat nooit de inhoud van een privébericht."}
        </p>
      </div>
      <form action={saveNotificationSettings} className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="email" defaultChecked={settings.emailEnabled} className="h-4 w-4 accent-bordeaux" />
          Meldingen per e-mail
        </label>
        <SubmitButton className="btn-secondary py-1.5">Opslaan</SubmitButton>
      </form>
      {pushConfigured() ? (
        <div>
          <p className="label">Pushmeldingen</p>
          <PushToggle publicKey={vapidPublicKey()} />
        </div>
      ) : (
        <p className="text-xs text-muted">Pushmeldingen zijn (nog) niet ingesteld; je krijgt de meldingen per e-mail.</p>
      )}
    </section>
  );
}
