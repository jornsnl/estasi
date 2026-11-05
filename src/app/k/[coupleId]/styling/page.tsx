import Link from "next/link";
import { saveStylingPlan, stylingImage } from "@/app/actions/ws-fase2";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { requireCouple } from "@/lib/ws/access";
import { aiConfigured } from "@/lib/ws/ai";
import { one, query } from "@/lib/ws/db";
import { IMAGE_ACCEPT } from "@/lib/ws/files";
import { formatDateTime } from "@/lib/ws/format";

export const metadata = { title: "Stylingplan & Moodboard" };

interface Plan {
  concept: string;
  colors: string[];
  ai_draft: string;
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
  const { couple, isAdmin } = await requireCouple(coupleId);
  const [plan, images, source] = await Promise.all([
    one<Plan>("select * from styling_plans where couple_id = $1", [couple.id]),
    query<{ id: string; file_id: string; caption: string }>("select id, file_id, caption from styling_images where couple_id = $1 order by created_at", [couple.id]),
    one<{ id: string; title: string; submitted_at: Date | null }>("select id, title, submitted_at from assignments where couple_id = $1 and styling_source order by position limit 1", [couple.id]),
  ]);
  const visible = isAdmin || plan?.published;

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Onderdeel</p>
        <h1 className="mt-1 text-3xl">Stylingplan & Moodboard</h1>
      </header>
      <Notice searchParams={searchParams} />

      {visible && plan && (plan.concept || plan.colors.length > 0) ? (
        <section className="card space-y-4 p-6">
          {!plan.published && <p className="rounded-lg bg-cream px-3 py-2 text-xs text-gold-ink">Nog niet zichtbaar voor het bruidspaar.</p>}
          {plan.concept && <p className="text-[15px] leading-7 whitespace-pre-line">{plan.concept}</p>}
          {plan.colors.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {plan.colors.map((c) => (
                <div key={c} className="text-center text-xs text-muted">
                  <div className="h-12 w-12 rounded-lg border border-line" style={{ background: c }} />
                  <span className="mt-1 block font-mono">{c}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="card p-6 text-sm text-muted">
          {source && !source.submitted_at ? (
            <>Het stylingplan maken we samen op basis van de opdracht <Link className="text-bordeaux underline" href={`/k/${couple.id}/opdrachten/${source.id}`}>{source.title}</Link>. Vul die eerst in.</>
          ) : (
            "Sabine werkt jullie stylingplan uit en zet het hier neer."
          )}
        </section>
      )}

      <section>
        <h2 className="section-title mb-3">Moodboard</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img) => (
            <figure key={img.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- uploaded image behind an access check */}
              <img src={`/api/ws-bestanden/${img.file_id}`} alt={img.caption || "Moodboard"} className="aspect-square w-full object-cover" />
              <figcaption className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted">
                <span>{img.caption}</span>
                <form action={stylingImage}>
                  <input type="hidden" name="coupleId" value={couple.id} />
                  <input type="hidden" name="imageId" value={img.id} />
                  <SubmitButton className="hover:text-bordeaux" confirm="Deze afbeelding verwijderen?">×</SubmitButton>
                </form>
              </figcaption>
            </figure>
          ))}
        </div>
        <form action={stylingImage} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="coupleId" value={couple.id} />
          <input type="file" name="image" accept={IMAGE_ACCEPT} required aria-label="Afbeelding" className="text-sm" />
          <input name="caption" placeholder="Onderschrift (optioneel)" aria-label="Onderschrift" className="input w-56 py-1.5" />
          <SubmitButton className="btn-secondary py-1.5" pendingText="Uploaden…">Toevoegen</SubmitButton>
        </form>
      </section>

      {isAdmin && (
        <section className="card space-y-4 p-6">
          <h2 className="text-xl">Stylingplan uitwerken</h2>
          {aiConfigured() && (
            <form action={saveStylingPlan}>
              <input type="hidden" name="coupleId" value={couple.id} />
              <input type="hidden" name="intent" value="draft" />
              <SubmitButton className="btn-secondary" pendingText="Concept maken… (kan een halve minuut duren)">
                {plan?.ai_draft ? "Nieuw AI-concept maken" : "AI-concept maken uit Thema & Moodboard"}
              </SubmitButton>
            </form>
          )}
          {plan?.ai_draft && (
            <details open={!plan.concept}>
              <summary className="cursor-pointer text-sm font-medium text-bordeaux">AI-concept{plan.ai_draft_at ? ` van ${formatDateTime(plan.ai_draft_at)}` : ""}</summary>
              <p className="mt-2 rounded-xl bg-cream p-4 text-sm whitespace-pre-line">{plan.ai_draft}</p>
            </details>
          )}
          <form action={saveStylingPlan} className="space-y-3">
            <input type="hidden" name="coupleId" value={couple.id} />
            <div>
              <label className="label" htmlFor="concept">Stylingplan (dit ziet het bruidspaar)</label>
              <textarea id="concept" name="concept" rows={10} defaultValue={plan?.concept || plan?.ai_draft || ""} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="colors">Kleurenpalet</label>
              <input id="colors" name="colors" defaultValue={(plan?.colors ?? []).join(" ")} placeholder="#c98b6b #7e9c86 #f5f0e8" className="input font-mono" />
              <p className="hint">Hexcodes, gescheiden door spaties.</p>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={plan?.published ?? false} className="accent-[#6B1E2E]" /> Zichtbaar voor het bruidspaar</label>
            <SubmitButton className="btn-primary" pendingText="Opslaan…">Stylingplan opslaan</SubmitButton>
          </form>
        </section>
      )}
    </div>
  );
}
