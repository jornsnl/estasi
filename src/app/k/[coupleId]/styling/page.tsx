import Link from "next/link";
import { saveStylingPart, saveStylingPlan, stylingImage } from "@/app/actions/ws-fase2";
import { releaseStylingPlan, savePlace } from "@/app/actions/ws-styling";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { AutoTextarea } from "@/components/ws/AutoTextarea";
import { ColorPalette } from "@/components/ws/ColorPalette";
import { FileUpload } from "@/components/ws/FileUpload";
import { StylingPlaces } from "@/components/ws/StylingPlaces";
import { StylingSummaryButton } from "@/components/ws/StylingSummaryButton";
import { requirePlanning } from "@/lib/ws/access";
import { aiConfigured } from "@/lib/ws/ai";
import { readPalette } from "@/lib/ws/color";
import { one, query } from "@/lib/ws/db";
import { directUploads } from "@/lib/ws/files";
import { coupleName, formatDateTime } from "@/lib/ws/format";
import { peopleFor } from "@/lib/ws/runsheet";
import { stylingPlaces } from "@/lib/ws/styling";

export const metadata = { title: "Stylingplan & Moodboard" };

interface Plan {
  concept: string;
  colors: string[];
  color_names: Record<string, string>;
  ai_draft: string;
  ai_error: string;
  ai_draft_at: Date | null;
  published: boolean;
  updated_at: Date;
}

export default async function Styling({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple, isAdmin } = await requirePlanning(coupleId);
  const [plan, images, source, places, people] = await Promise.all([
    one<Plan>("select * from styling_plans where couple_id = $1", [couple.id]),
    query<{ id: string; file_id: string; caption: string }>("select id, file_id, caption from styling_images where couple_id = $1 order by created_at", [couple.id]),
    one<{ id: string; title: string; kind: string; done: number; total: number; completed_at: Date | null }>(
      `select a.id, a.title, a.kind, a.completed_at,
              (select count(*) filter (where s.completed_at is not null)::int from assignment_sections s where s.assignment_id = a.id) as done,
              (select count(*)::int from assignment_sections s where s.assignment_id = a.id) as total
         from assignments a where a.couple_id = $1 and a.styling_source order by a.kind desc, a.position limit 1`,
      [couple.id],
    ),
    stylingPlaces(couple.id, isAdmin),
    peopleFor(couple.id),
  ]);
  const palette = readPalette(plan?.colors, plan?.color_names);
  const showConcept = (isAdmin || plan?.published) && plan && (plan.concept || palette.length > 0);
  const drafts = places.reduce((n, p) => n + p.items.filter((i) => i.draft).length, 0);
  const direct = directUploads();

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Onderdeel</p>
        <h1 className="mt-1 text-3xl">Stylingplan & Moodboard</h1>
        {source && (
          <p className="mt-2 text-sm">
            <Link href={`/k/${couple.id}/opdrachten/${source.id}`} className="text-bordeaux underline">Opdracht {source.title}</Link>
            {source.kind === "sections" && <span className="text-muted"> · {source.done} van {source.total} afgerond</span>}
          </p>
        )}
      </header>
      <Notice searchParams={searchParams} />

      {/* Feedback Sabine (18): 1 Moodboard, 2 Kleurkiezer, 3 Themaomschrijving, 4 Styling per plek. */}
      <section id="moodboard" className="scroll-mt-6">
        <h2 className="section-title mb-3">Moodboard</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img) => (
            <figure key={img.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
              {/* Feedback Sabine (17): a picture opens large in a new tab and can be downloaded. */}
              <a href={`/api/ws-bestanden/${img.file_id}`} target="_blank" rel="noopener" className="block" aria-label={`${img.caption || "Afbeelding"} openen`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- uploaded image behind an access check */}
                <img src={`/api/ws-bestanden/${img.file_id}`} alt={img.caption || "Moodboard"} className="aspect-square w-full object-cover transition-opacity hover:opacity-90" />
              </a>
              <figcaption className="space-y-1 px-3 py-2 text-xs text-muted">
                {img.caption && <span className="block">{img.caption}</span>}
                <span className="flex items-center justify-between gap-2">
                  <span className="flex gap-3">
                    <a href={`/api/ws-bestanden/${img.file_id}`} target="_blank" rel="noopener" className="text-bordeaux hover:underline">Openen</a>
                    <a href={`/api/ws-bestanden/${img.file_id}?download=1`} download className="text-bordeaux hover:underline">Downloaden</a>
                  </span>
                  <form action={stylingImage}>
                    <input type="hidden" name="coupleId" value={couple.id} />
                    <input type="hidden" name="imageId" value={img.id} />
                    <SubmitButton className="hover:text-bordeaux" confirm="Weet je het zeker? Deze afbeelding wordt verwijderd.">×</SubmitButton>
                  </form>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
        <form action={stylingImage} className="mt-3 space-y-2">
          <input type="hidden" name="coupleId" value={couple.id} />
          <FileUpload name="image" coupleId={couple.id} kind="image" direct={direct} multiple required label="Foto's uploaden" />
          <div className="flex flex-wrap items-center gap-2">
            <input name="caption" placeholder="Onderschrift (optioneel)" aria-label="Onderschrift" className="input w-56 py-1.5" />
            <SubmitButton className="btn-primary py-1.5" pendingText="Toevoegen…">Toevoegen aan moodboard</SubmitButton>
          </div>
        </form>
      </section>

      <section id="kleuren" className="card scroll-mt-6 space-y-3 p-6">
        <div>
          <h2 className="section-title">Kleuren</h2>
          <p className="text-sm text-muted">Klik op een kleur om hem aan te passen, sleep om de volgorde te veranderen, of voeg een kleur toe.</p>
        </div>
        <form action={saveStylingPart} className="space-y-3">
          <input type="hidden" name="coupleId" value={couple.id} />
          <input type="hidden" name="part" value="colors" />
          <ColorPalette initial={palette} />
          <SubmitButton className="btn-primary py-1.5" pendingText="Opslaan…">Kleuren opslaan</SubmitButton>
        </form>
      </section>

      <section id="thema" className="card scroll-mt-6 space-y-3 p-6">
        <h2 className="section-title">Themaomschrijving</h2>
        {isAdmin ? (
          <form action={saveStylingPlan} className="space-y-3">
            <input type="hidden" name="coupleId" value={couple.id} />
            {!plan?.published && <p className="rounded-lg bg-cream px-3 py-2 text-xs text-gold-ink">Nog niet zichtbaar voor het bruidspaar.</p>}
            <label className="sr-only" htmlFor="concept">Themaomschrijving: stijl en sfeer</label>
            <AutoTextarea id="concept" name="concept" defaultValue={plan?.concept || plan?.ai_draft || ""} placeholder="Stijl, sfeer, materialen: het thema van de bruiloft" className="input min-h-40" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={plan?.published ?? false} className="accent-[#6B1E2E]" /> Zichtbaar voor het bruidspaar</label>
            <SubmitButton className="btn-primary py-1.5" pendingText="Opslaan…">Opslaan</SubmitButton>
          </form>
        ) : showConcept || plan?.published ? (
          <form action={saveStylingPart} className="space-y-3">
            <input type="hidden" name="coupleId" value={couple.id} />
            <input type="hidden" name="part" value="theme" />
            <label className="sr-only" htmlFor="concept">Themaomschrijving</label>
            <AutoTextarea id="concept" name="concept" defaultValue={plan?.concept ?? ""} placeholder="Stijl, sfeer, materialen: jullie thema" className="input min-h-40" />
            <SubmitButton className="btn-primary py-1.5" pendingText="Opslaan…">Opslaan</SubmitButton>
          </form>
        ) : (
          <div className="text-sm text-muted">
            {source && !source.completed_at
              ? <>Sabine maakt jullie themaomschrijving op basis van de opdracht <Link className="text-bordeaux underline" href={`/k/${couple.id}/opdrachten/${source.id}`}>{source.title}</Link>. Vul die eerst in.</>
              : <>
                  <span className="block font-medium text-ink">De samenvatting is binnenkort beschikbaar.</span>
                  <span className="mt-1 block">Sabine maakt op basis van jullie antwoorden een overzicht van jullie stijl en sfeer, en zet het hier neer.</span>
                </>}
          </div>
        )}
      </section>

      <section id="plan" className="scroll-mt-6 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="section-title">Styling per plek</h2>
            <p className="text-sm text-muted">Wat komt waar, en wie regelt het. Staat hier een van jullie namen bij, dan komt het vanzelf op de meeneemlijst &quot;Styling meenemen&quot;.</p>
          </div>
          {isAdmin && drafts > 0 && (
            <form action={releaseStylingPlan}>
              <input type="hidden" name="coupleId" value={couple.id} />
              <SubmitButton className="btn-primary" confirm="Het stylingplan en alle voorstellen worden zichtbaar voor het bruidspaar. Doorgaan?">Vrijgeven ({drafts} voorstellen)</SubmitButton>
            </form>
          )}
        </div>
        <StylingPlaces coupleId={couple.id} places={places} names={people.map((p) => p.name)} isAdmin={isAdmin} mode="edit" direct={direct} />
        <form action={savePlace} className="flex flex-wrap gap-2">
          <input type="hidden" name="coupleId" value={couple.id} />
          <input name="name" required placeholder="Nieuwe plek, bijvoorbeeld: Tuin" aria-label="Nieuwe plek" className="input max-w-xs py-1.5" />
          <SubmitButton className="btn-secondary py-1.5">Plek toevoegen</SubmitButton>
        </form>
      </section>

      {isAdmin && (
        <section id="uitwerken" className="card scroll-mt-6 space-y-4 p-6">
          <h2 className="text-xl">Stylingplan uitwerken</h2>
          <div className="rounded-xl bg-cream p-4 text-sm">
            <p className="font-medium">Samenvatting maken met {aiConfigured() ? "AI" : "Claude"}</p>
            <p className="mt-1 text-muted">
              Maakt van de antwoorden uit {source ? `"${source.title}"` : "de opdracht"} een overzicht van stijl, sfeer, kleuren en materialen, plus per plek een voorstel voor stylingitems. Alles komt als concept hierin; het bruidspaar ziet het pas na &quot;Vrijgeven&quot;.
              {source?.kind === "sections" && source.done < source.total ? ` Let op: nog ${source.total - source.done} van de ${source.total} opdrachten open.` : ""}
            </p>
            {aiConfigured() ? (
              <StylingSummaryButton coupleId={couple.id} hasSummary={Boolean(plan?.ai_draft)} lastError={plan?.ai_error || undefined} />
            ) : (
              <p className="mt-2 text-xs text-muted">
                Maak de samenvatting met Claude via de koppeling (MCP): vraag bijvoorbeeld &quot;Maak de samenvatting van {source?.title ?? "Thema & Styling"} voor {coupleName(couple)}&quot;. Claude zet het concept hier neer. Het bruidspaar ziet intussen &quot;De samenvatting is binnenkort beschikbaar.&quot;
              </p>
            )}
          </div>
          {plan?.ai_draft && (
            <details open={!plan.concept}>
              <summary className="cursor-pointer text-sm font-medium text-bordeaux">Samenvatting{plan.ai_draft_at ? ` van ${formatDateTime(plan.ai_draft_at)}` : ""}</summary>
              <p className="mt-2 rounded-xl bg-cream p-4 text-sm whitespace-pre-line">{plan.ai_draft}</p>
            </details>
          )}
          <p className="text-sm text-muted">Neem over wat je wilt in de <a href="#thema" className="text-bordeaux underline">themaomschrijving</a> en de <a href="#kleuren" className="text-bordeaux underline">kleuren</a> hierboven.</p>
        </section>
      )}
    </div>
  );
}
