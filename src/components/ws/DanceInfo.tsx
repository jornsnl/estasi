import Link from "next/link";
import { requestDance } from "@/app/actions/ws-dance";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { VideoEmbed } from "@/components/VideoEmbed";
import { one, query } from "@/lib/ws/db";
import { formatDate, formatMoney } from "@/lib/ws/format";
import { danceName, offerLines } from "@/lib/ws/package-order";
import { getSettings } from "@/lib/ws/settings";
import type { Couple, Package } from "@/lib/ws/types";

/**
 * Feedback 9.2: what a couple sees under "De openingsdans" when the dance is
 * not in their package. The cards are the opening dance packages, so a
 * change in Pakketten (name, price, contents, order, hidden) shows here too.
 */
export async function DanceInfo({
  couple,
  isAdmin,
  searchParams,
}: {
  couple: Couple;
  isAdmin: boolean;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [settings, offers, request] = await Promise.all([
    getSettings(),
    query<Package>("select * from packages where kind = 'od' and not archived order by position, name"),
    one<{ created_at: Date; package_name: string }>("select created_at, package_name from dance_requests where couple_id = $1 order by created_at desc limit 1", [couple.id]),
  ]);
  const video = settings.dance_video_file_id ? `/api/ws-bestanden/${settings.dance_video_file_id}` : null;

  return (
    <div className="max-w-4xl space-y-8">
      {isAdmin && (
        <p className="rounded-lg border border-gold/40 bg-gold-soft px-4 py-3 text-sm text-gold-ink">
          Dit bruidspaar heeft geen openingsdans in het pakket en ziet daarom deze informatiepagina.{" "}
          <Link href={`/k/${couple.id}/openingsdans?weergave=opdrachten`} className="underline">Toch de pagina met opdrachten openen</Link> ·{" "}
          <Link href="/beheer/bruidsparen/openingsdans" className="underline">Video, pakketten en aanvragen beheren</Link>
        </p>
      )}
      <header>
        <p className="eyebrow">Onderdeel</p>
        <h1 className="mt-1 text-3xl">De openingsdans</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed">
          De openingsdans zit momenteel niet in jullie pakket. Hebben jullie wel behoefte aan een openingsdans? Geef het aan via de knop hieronder, dan neemt Sabine
          contact met jullie op.
        </p>
      </header>
      <Notice searchParams={searchParams} />

      {(video || settings.dance_video_url) && (
        <section aria-label="Video van een openingsdans" className="max-w-3xl">
          {video ? (
            <video controls preload="metadata" playsInline src={video} className="aspect-video w-full rounded-xl bg-ink" />
          ) : (
            <VideoEmbed url={settings.dance_video_url} title="Video van een openingsdans" />
          )}
        </section>
      )}

      {offers.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-2xl">Kies jullie stijl</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {offers.map((p) => (
              <article key={p.id} className="flex flex-col rounded-2xl border border-gold/50 bg-white p-5 shadow-sm">
                <h3 className="font-serif text-xl text-bordeaux">{danceName(p.name)}</h3>
                {p.price_cents > 0 && <p className="mt-1 font-serif text-2xl text-gold-ink">{formatMoney(p.price_cents)}</p>}
                <div className="my-3 h-px bg-gold/40" />
                <ul className="space-y-1.5 text-sm">
                  {offerLines(p.description, p.variant).map((line) => (
                    <li key={line} className="flex gap-2"><span className="text-gold" aria-hidden="true">✦</span><span>{line}</span></li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}

      <section id="interesse" className="scroll-mt-6">
        {request ? (
          <div className="space-y-2">
            <button type="button" disabled className="btn-primary cursor-default opacity-70">Aanvraag verstuurd op {formatDate(request.created_at)}</button>
            <p className="text-sm text-muted">Jullie keuze: {request.package_name}. Sabine neemt contact met jullie op.</p>
          </div>
        ) : (
          <details className="group max-w-2xl">
            <summary className="btn-primary cursor-pointer list-none [&::-webkit-details-marker]:hidden">Ik heb interesse in een openingsdans</summary>
            <form action={requestDance} className="card mt-4 space-y-4 p-5">
              <input type="hidden" name="coupleId" value={couple.id} />
              <fieldset>
                <legend className="label">Welk pakket spreekt jullie aan?</legend>
                <div className="space-y-2">
                  {offers.map((p, i) => (
                    <label key={p.id} className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm">
                      <input type="radio" name="packageId" value={p.id} required defaultChecked={i === 0} className="accent-[#6B1E2E]" />
                      {danceName(p.name)}{p.price_cents > 0 ? ` (${formatMoney(p.price_cents)})` : ""}
                    </label>
                  ))}
                  <label className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm">
                    <input type="radio" name="packageId" value="unknown" required defaultChecked={offers.length === 0} className="accent-[#6B1E2E]" /> Ik weet het nog niet
                  </label>
                </div>
              </fieldset>
              <div>
                <label className="label" htmlFor="message">Bericht (optioneel)</label>
                <textarea id="message" name="message" rows={4} className="input" placeholder="Bijvoorbeeld jullie nummer of wanneer jullie willen beginnen" />
              </div>
              <SubmitButton className="btn-primary" pendingText="Versturen…">Aanvraag versturen</SubmitButton>
            </form>
          </details>
        )}
      </section>
    </div>
  );
}
