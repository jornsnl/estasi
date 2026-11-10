import Link from "next/link";
import { notFound } from "next/navigation";
import { addNoteAction, convertLeadAction, deleteLeadAction, setStageAction, updateLeadAction } from "@/app/actions/pipeline";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { LeadFields } from "@/components/pipeline/LeadFields";
import { INTEREST_LABELS, SOURCE_LABELS, STAGES, STAGE_COLORS, STAGE_LABELS } from "@/lib/pipeline/rules";
import { getLead, leadActivity, type Activity } from "@/lib/pipeline/server";
import { one } from "@/lib/db";
import { coupleName, formatDate, formatDateTime, formatMoney } from "@/lib/ws/format";

export const metadata = { title: "Lead" };

function activityText(a: Activity) {
  if (a.kind === "stage") return `Van ${a.from_stage ? STAGE_LABELS[a.from_stage] : "?"} naar ${a.to_stage ? STAGE_LABELS[a.to_stage] : "?"}`;
  if (a.kind === "created" && a.to_stage) return `${a.body} in ${STAGE_LABELS[a.to_stage]}`;
  return a.body;
}

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();
  const [activity, couple] = await Promise.all([
    leadActivity(lead.id),
    lead.couple_id
      ? one<{ id: string; partner1_first: string; partner2_first: string; status: string }>(
          "select id, partner1_first, partner2_first, status from wedding_space.couples where id = $1",
          [lead.couple_id],
        )
      : Promise.resolve(null),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/beheer/pipeline" className="text-sm text-muted hover:text-bordeaux">← Pipeline</Link>
          <h1 className="mt-1 text-3xl">{lead.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STAGE_COLORS[lead.stage] }} />
            {STAGE_LABELS[lead.stage]} · {INTEREST_LABELS[lead.interest]} · {SOURCE_LABELS[lead.source]} · sinds {formatDateTime(lead.created_at)}
          </p>
        </div>
        {lead.value_cents ? <p className="font-serif text-3xl text-bordeaux">{formatMoney(lead.value_cents)}</p> : null}
      </header>
      <Notice searchParams={searchParams} />

      {/* Stage in one click */}
      <form action={setStageAction} className="flex flex-wrap gap-1.5">
        <input type="hidden" name="leadId" value={lead.id} />
        {STAGES.map((stage) => (
          <button
            key={stage}
            type="submit"
            name="stage"
            value={stage}
            disabled={stage === lead.stage}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              stage === lead.stage ? "border-bordeaux bg-bordeaux text-white" : "border-line bg-white text-muted hover:border-bordeaux hover:text-bordeaux"
            }`}
          >
            {STAGE_LABELS[stage]}
          </button>
        ))}
      </form>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <form action={updateLeadAction} className="card space-y-4 p-5">
            <input type="hidden" name="leadId" value={lead.id} />
            <p className="eyebrow">Gegevens</p>
            <LeadFields lead={lead} />
            <SubmitButton pendingText="Opslaan…">Opslaan</SubmitButton>
          </form>

          <section id="tijdlijn" className="card space-y-4 p-5">
            <p className="eyebrow">Tijdlijn</p>
            <form action={addNoteAction} className="flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="leadId" value={lead.id} />
              <label className="sr-only" htmlFor="body">Notitie</label>
              <input id="body" name="body" required placeholder="Bijv. gebeld, ze komen 12 maart langs voor een kennismaking" className="input" />
              <SubmitButton className="btn-primary shrink-0" pendingText="Toevoegen…">Toevoegen</SubmitButton>
            </form>
            <ol className="space-y-3">
              {activity.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${a.kind === "note" ? "bg-bordeaux" : "bg-line"}`} />
                  <div className="min-w-0">
                    <p className={`whitespace-pre-line text-sm ${a.kind === "note" ? "" : "text-muted"}`}>{activityText(a)}</p>
                    <p className="text-xs text-muted">
                      {formatDateTime(a.created_at)}
                      {a.actor_name && ` · ${a.actor_name}`}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="card space-y-2 p-4">
            <p className="eyebrow">Contact</p>
            {lead.email && <a href={`mailto:${lead.email}`} className="block break-all text-sm text-bordeaux hover:underline">{lead.email}</a>}
            {lead.phone && <a href={`tel:${lead.phone}`} className="block text-sm text-bordeaux hover:underline">{lead.phone}</a>}
            {!lead.email && !lead.phone && <p className="text-sm text-muted">Geen contactgegevens.</p>}
            {lead.wedding_date && <p className="text-sm text-muted">Trouwt op {formatDate(lead.wedding_date)}{lead.location && ` in ${lead.location}`}</p>}
          </div>

          <div className="card space-y-3 p-4">
            <p className="eyebrow">Your Wedding Space</p>
            {couple ? (
              <Link href={`/k/${couple.id}`} className="block text-sm font-medium hover:text-bordeaux">
                {coupleName(couple)} →
              </Link>
            ) : (
              <form action={convertLeadAction} className="space-y-2">
                <input type="hidden" name="leadId" value={lead.id} />
                <p className="text-xs text-muted">
                  Maakt een portaal als concept met de gegevens van deze lead (of koppelt het bruidspaar met hetzelfde e-mailadres) en zet de lead op Geboekt. Het bruidspaar ziet nog niets.
                </p>
                <SubmitButton className="btn-primary w-full" pendingText="Aanmaken…">Maak bruidspaar</SubmitButton>
              </form>
            )}
          </div>

          <form action={deleteLeadAction} className="px-1">
            <input type="hidden" name="leadId" value={lead.id} />
            <SubmitButton className="text-xs text-muted hover:text-bordeaux" confirm={`"${lead.title}" en de tijdlijn definitief verwijderen?`}>
              Lead verwijderen
            </SubmitButton>
          </form>
        </aside>
      </div>
    </div>
  );
}
