import Link from "next/link";
import { Notice } from "@/components/Notice";
import { MailComposer } from "@/components/ws/MailComposer";
import { requireCoupleAdmin } from "@/lib/ws/access";
import { isUuid, query } from "@/lib/ws/db";
import { mailClosing } from "@/lib/ws/mail-format";
import { mailConfigured, mailFrom } from "@/lib/ws/mail";
import { getSettings } from "@/lib/ws/settings";

export const metadata = { title: "Mail sturen" };

/** Feedback 5.6, Sabine only: the mail window for one or more guests (?gast=id&gast=id). */
export default async function MailGuests({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const ctx = await requireCoupleAdmin(coupleId);
  const raw = (await searchParams).gast;
  const ids = [...new Set((Array.isArray(raw) ? raw : raw ? [raw] : []).filter(isUuid))].slice(0, 150);
  const [guests, settings] = await Promise.all([
    ids.length
      ? query<{ id: string; first_name: string; last_name: string; email: string }>(
          "select id, first_name, last_name, email from guests where couple_id = $1 and id = any($2::uuid[]) order by last_name, first_name",
          [ctx.couple.id, ids],
        )
      : Promise.resolve([]),
    getSettings(),
  ]);
  const back = `/k/${ctx.couple.id}/gasten`;

  return (
    <div className="space-y-6">
      <header>
        <Link href={back} className="text-sm text-muted hover:text-bordeaux">← Gastenlijst</Link>
        <h1 className="mt-2 text-3xl">Mail sturen</h1>
        <p className="mt-1 text-sm text-muted">Verstuurd vanaf {mailFrom()}; antwoorden komen binnen bij {settings.contact_email}. Elke mail komt in de mailgeschiedenis.</p>
      </header>
      {!mailConfigured() && (
        <p className="rounded-lg border border-gold/40 bg-gold-soft px-4 py-3 text-sm text-gold-ink">
          Het versturen van e-mail staat niet ingesteld. De mails komen als &quot;Mislukt&quot; in de mailgeschiedenis en kunnen later opnieuw worden verstuurd.
        </p>
      )}
      <Notice searchParams={searchParams} />
      {guests.length === 0 ? (
        <p className="card p-5 text-sm text-muted">Kies eerst een of meer gasten in de <Link href={back} className="underline">gastenlijst</Link>.</p>
      ) : (
        <MailComposer
          coupleId={ctx.couple.id}
          recipients={guests.map((g) => ({ id: g.id, firstName: g.first_name, name: `${g.first_name} ${g.last_name}`.trim(), email: g.email.trim() }))}
          closing={mailClosing(settings, ctx.couple, ctx.kinds)}
          from={mailFrom()}
          replyTo={settings.contact_email}
        />
      )}
    </div>
  );
}
