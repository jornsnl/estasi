import { Notice } from "@/components/Notice";
import { MailLog } from "@/components/ws/MailLog";
import { mailConfigured } from "@/lib/ws/mail";

export const metadata = { title: "Mailgeschiedenis" };

/** Every mail the app sent (Academy, Your Wedding Space, test mails), newest first. */
export default async function MailHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <div>
      <p className="eyebrow">Beheer</p>
      <h1 className="mt-1 mb-6 text-4xl">Mailgeschiedenis</h1>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Alle mails die de app verstuurt: Academy, Your Wedding Space en testmails, met ontvanger, status en bij een mislukte mail de reden. Mislukte mails kun je
          opnieuw versturen. Mails met een inloglink staan hier zonder tekst. Uitnodigingen en wachtwoordherstel van het inloggen gaan via Supabase en staan hier niet.
        </p>
        {!mailConfigured() && (
          <p className="rounded-lg border border-gold/40 bg-gold-soft px-4 py-3 text-sm text-gold-ink">
            Het versturen van e-mail staat niet ingesteld (geen RESEND_API_KEY of SMTP). Mails komen als &quot;Mislukt&quot; in de geschiedenis en kunnen later opnieuw worden verstuurd.
          </p>
        )}
        <Notice searchParams={searchParams} />
        <MailLog coupleId={null} isAdmin path="/beheer/mailgeschiedenis" filters={await searchParams} />
      </div>
    </div>
  );
}
