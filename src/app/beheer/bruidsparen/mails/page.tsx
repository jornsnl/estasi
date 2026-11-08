import { Notice } from "@/components/Notice";
import { MailLog } from "@/components/ws/MailLog";
import { mailConfigured } from "@/lib/ws/mail";

export const metadata = { title: "Mailgeschiedenis" };

export default async function MailHistory({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Beheer</p>
        <h1 className="mt-1 text-3xl">Mailgeschiedenis</h1>
        <p className="mt-1 text-sm text-muted">Elke mail die Your Wedding Space verstuurt, van alle bruidsparen. Mislukte mails kun je opnieuw versturen.</p>
      </header>
      {!mailConfigured() && (
        <p className="rounded-lg border border-gold/40 bg-gold-soft px-4 py-3 text-sm text-gold-ink">
          Het versturen van e-mail staat niet ingesteld (geen RESEND_API_KEY of SMTP). Mails komen als &quot;Mislukt&quot; in de geschiedenis en kunnen later opnieuw worden verstuurd.
        </p>
      )}
      <Notice searchParams={searchParams} />
      <MailLog coupleId={null} isAdmin path="/beheer/bruidsparen/mails" filters={await searchParams} />
    </div>
  );
}
