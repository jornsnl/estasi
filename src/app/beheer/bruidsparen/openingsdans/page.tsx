import Link from "next/link";
import { markDanceRequest, saveDanceExtraVideos, saveDanceOffer, saveDanceVideo } from "@/app/actions/ws-dance";
import { MAX_DANCE_VIDEOS } from "@/lib/ws/dance";
import { archivePackage } from "@/app/actions/ws-admin";
import { deletePackage, moveDancePackage } from "@/app/actions/ws-packages";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { SortableRows } from "@/components/ws/SortableRows";
import { VideoSettingForm } from "@/components/ws/VideoSettingForm";
import { query } from "@/lib/ws/db";
import { formatDate, formatDateTime } from "@/lib/ws/format";
import { danceName } from "@/lib/ws/package-order";
import { getSettings } from "@/lib/ws/settings";
import type { Package } from "@/lib/ws/types";

export const metadata = { title: "Openingsdans" };

const BACK = "/beheer/bruidsparen/openingsdans#pakketten";

function OfferFields({ p }: { p?: Package }) {
  const id = p?.id ?? "nieuw";
  return (
    <div className="grid gap-2 sm:grid-cols-6">
      <div className="sm:col-span-4"><label className="label" htmlFor={`name-${id}`}>Naam</label><input id={`name-${id}`} name="name" required defaultValue={p ? danceName(p.name) : ""} className="input py-1.5" /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor={`price-${id}`}>Prijs (€)</label><input id={`price-${id}`} name="price" inputMode="decimal" defaultValue={p?.price_cents ? (p.price_cents / 100).toFixed(2).replace(".", ",").replace(",00", "") : ""} className="input py-1.5" /></div>
      <div className="sm:col-span-6">
        <label className="label" htmlFor={`description-${id}`}>Inhoud (één onderdeel per regel)</label>
        <textarea id={`description-${id}`} name="description" rows={5} defaultValue={p?.description ?? ""} className="input py-1.5 text-sm" />
      </div>
    </div>
  );
}

export default async function DanceAdmin({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [settings, offers, requests] = await Promise.all([
    getSettings(),
    query<Package & { couples: number }>(
      `select p.*, (select count(*)::int from couple_packages cp where cp.package_id = p.id) as couples
         from packages p where kind = 'od' order by archived, position, name, id`,
    ),
    query<{ id: string; couple_id: string; partner1_first: string; partner2_first: string; wedding_date: string | null; package_name: string; message: string; requested_by_name: string; handled_at: Date | null; created_at: Date }>(
      `select r.*, c.partner1_first, c.partner2_first, c.wedding_date from dance_requests r join couples c on c.id = r.couple_id
        order by r.handled_at is not null, r.created_at desc limit 200`,
    ),
  ]);
  const open = requests.filter((r) => !r.handled_at).length;

  return (
    <div className="max-w-4xl space-y-8">
      <header>
        <p className="eyebrow">Beheer</p>
        <h1 className="mt-1 text-3xl">Openingsdans</h1>
        <p className="mt-1 text-sm text-muted">
          Bruidsparen zonder openingsdans in hun pakket zien onder &quot;De openingsdans&quot; een informatiepagina met deze video en pakketten. Dit geldt voor alle bruidsparen.
        </p>
      </header>
      <Notice searchParams={searchParams} />

      <section id="aanvragen" className="scroll-mt-6 space-y-2">
        <h2 className="section-title">Interesse-aanvragen {open > 0 && <span className="ml-1 rounded-full bg-bordeaux px-2 py-0.5 font-sans text-xs text-white">{open} open</span>}</h2>
        <div className="card divide-y divide-line">
          {requests.map((r) => (
            <div key={r.id} className={`flex flex-wrap items-start justify-between gap-3 p-4 text-sm ${r.handled_at ? "opacity-60" : ""}`}>
              <div className="min-w-0">
                <Link href={`/k/${r.couple_id}/openingsdans`} className="font-medium hover:text-bordeaux">{[r.partner1_first, r.partner2_first].filter(Boolean).join(" & ")}</Link>
                <span className="text-muted"> · trouwdatum {r.wedding_date ? formatDate(r.wedding_date) : "onbekend"}</span>
                <p className="mt-0.5"><strong>{r.package_name}</strong></p>
                {r.message && <p className="mt-1 whitespace-pre-line text-muted">{r.message}</p>}
                <p className="mt-1 text-xs text-muted">{formatDateTime(r.created_at)} · {r.requested_by_name}{r.handled_at ? ` · afgehandeld ${formatDate(r.handled_at)}` : ""}</p>
              </div>
              <form action={markDanceRequest}>
                <input type="hidden" name="requestId" value={r.id} />
                <input type="hidden" name="handled" value={r.handled_at ? "0" : "1"} />
                <SubmitButton className="btn-secondary py-1 text-xs">{r.handled_at ? "Weer open" : "Afgehandeld"}</SubmitButton>
              </form>
            </div>
          ))}
          {requests.length === 0 && <p className="p-4 text-sm text-muted">Nog geen aanvragen.</p>}
        </div>
      </section>

      <section id="video" className="scroll-mt-6 space-y-2">
        <h2 className="section-title">Video</h2>
        <VideoSettingForm
          action={saveDanceVideo}
          fileId={settings.dance_video_file_id}
          url={settings.dance_video_url}
          title="Video van een openingsdans"
          emptyText="Nog geen video. Zonder video staat er op de informatiepagina geen videoblok."
        />
        {/* Feedback: up to three videos on the page; these are the second and the third. */}
        <form action={saveDanceExtraVideos} className="card space-y-3 p-5">
          <p className="label">Extra video&apos;s (maximaal {MAX_DANCE_VIDEOS - 1}, dus {MAX_DANCE_VIDEOS} in totaal)</p>
          {Array.from({ length: MAX_DANCE_VIDEOS - 1 }, (_, i) => (
            <input
              key={i}
              name="extraVideoUrl"
              defaultValue={settings.dance_extra_video_urls?.[i] ?? ""}
              placeholder="https://www.youtube.com/watch?v=…"
              aria-label={`Video ${i + 2} (YouTube- of Vimeo-link)`}
              className="input"
            />
          ))}
          <SubmitButton className="btn-secondary" pendingText="Opslaan…">Extra video&apos;s opslaan</SubmitButton>
        </form>
      </section>

      <section id="pakketten" className="scroll-mt-6 space-y-2">
        <h2 className="section-title">Pakketten</h2>
        <p className="text-sm text-muted">
          De kaarten op de informatiepagina, in deze volgorde. Dit zijn de pakketten van de soort Openingsdans: wat je hier aanpast, staat ook bij{" "}
          <Link href="/beheer/bruidsparen/pakketten" className="underline">Pakketten</Link>. Verborgen pakketten staan niet op de pagina.
        </p>
        <div className="card">
          <SortableRows
            label="Pakketten openingsdans"
            move={moveDancePackage}
            rows={offers.map((p) => ({
              id: p.id,
              dimmed: p.archived,
              node: (
                <details>
                  <summary className="cursor-pointer text-sm">
                    <span className="font-medium">{danceName(p.name)}</span>
                    {p.archived && <span className="ml-2 rounded-full bg-cream-deep px-1.5 text-xs text-muted">verborgen</span>}
                  </summary>
                  <div className="mt-3 space-y-3 pb-2">
                    <form action={saveDanceOffer} className="space-y-3">
                      <input type="hidden" name="packageId" value={p.id} />
                      <OfferFields p={p} />
                      <SubmitButton className="btn-primary py-1.5" pendingText="Opslaan…">Opslaan</SubmitButton>
                    </form>
                    <div className="flex flex-wrap gap-4">
                      <form action={archivePackage}>
                        <input type="hidden" name="packageId" value={p.id} />
                        <input type="hidden" name="archived" value={p.archived ? "0" : "1"} />
                        <input type="hidden" name="back" value={BACK} />
                        <SubmitButton className="text-xs text-muted hover:text-bordeaux">{p.archived ? "Zichtbaar maken" : "Verbergen"}</SubmitButton>
                      </form>
                      {p.couples === 0 && (
                        <form action={deletePackage}>
                          <input type="hidden" name="packageId" value={p.id} />
                          <input type="hidden" name="back" value={BACK} />
                          <SubmitButton className="text-xs text-muted hover:text-bordeaux" confirm={`"${danceName(p.name)}" definitief verwijderen?`}>Verwijderen</SubmitButton>
                        </form>
                      )}
                    </div>
                  </div>
                </details>
              ),
            }))}
          />
          {offers.length === 0 && <p className="p-4 text-sm text-muted">Nog geen pakketten.</p>}
        </div>
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-medium text-bordeaux">+ Pakket toevoegen</summary>
          <form action={saveDanceOffer} className="mt-3 space-y-3">
            <OfferFields />
            <SubmitButton className="btn-primary py-1.5">Toevoegen</SubmitButton>
          </form>
        </details>
      </section>
    </div>
  );
}
