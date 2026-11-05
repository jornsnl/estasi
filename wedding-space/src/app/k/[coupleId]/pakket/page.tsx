import { addMeeting, deleteMeeting, saveMeeting } from "@/app/actions/portal";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { requireCouple } from "@/lib/auth/access";
import { one, query } from "@/lib/db";
import { DOCUMENT_ACCEPT } from "@/lib/data/files";
import { formatDate, formatMoney } from "@/lib/domain/format";
import type { Meeting, Package } from "@/lib/types";

export const metadata = { title: "Jullie Pakket" };

const STATUS_LABEL = { to_plan: "Nog in te plannen", planned: "Gepland", done: "Geweest", skipped: "Vervalt" } as const;
const STATUS_TONE = { to_plan: "bg-cream text-muted", planned: "bg-[#f3eedb] text-gold-ink", done: "bg-success-soft text-success", skipped: "bg-cream text-muted" } as const;

export default async function PackagePage({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple, isAdmin } = await requireCouple(coupleId);
  const [pkg, meetings] = await Promise.all([
    couple.package_id ? one<Package>("select * from packages where id = $1", [couple.package_id]) : null,
    query<Meeting>(
      `select m.*, f.name as summary_file_name from meetings m left join files f on f.id = m.summary_file_id
        where m.couple_id = $1 order by m.position`,
      [couple.id],
    ),
  ]);
  const hasEvaluation = meetings.some((m) => m.kind === "evaluation");

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Onderdeel</p>
        <h1 className="mt-1 text-3xl">Jullie Pakket</h1>
        {pkg && (
          <p className="mt-1 text-gold-ink">
            {pkg.name}{pkg.variant ? ` · ${pkg.variant}` : ""}{isAdmin && pkg.price_cents > 0 ? ` · ${formatMoney(pkg.price_cents)} (catalogusprijs)` : ""}
          </p>
        )}
        {pkg?.description && <p className="mt-3 max-w-3xl text-sm whitespace-pre-line text-muted">{pkg.description}</p>}
      </header>
      <Notice searchParams={searchParams} />

      {meetings.length === 0 && <p className="card p-5 text-sm text-muted">Bij dit pakket horen geen meetings.</p>}

      <ol className="space-y-4">
        {meetings.map((m) => (
          <li key={m.id} id={`m-${m.id}`} className="card scroll-mt-6 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl">{m.title}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs ${STATUS_TONE[m.status]}`}>
                {STATUS_LABEL[m.status]}{m.planned_on && m.status === "planned" ? ` · ${formatDate(m.planned_on)}` : ""}
              </span>
            </div>
            {m.guide && <p className="mt-2 text-sm text-muted">{m.guide}</p>}

            {(m.summary || m.summary_file_id) && (
              <div className="mt-4 rounded-xl bg-cream p-4">
                <p className="eyebrow mb-1">Samenvatting</p>
                {m.summary && <p className="text-sm whitespace-pre-line">{m.summary}</p>}
                {m.summary_file_id && (
                  <a href={`/api/bestanden/${m.summary_file_id}`} className="mt-2 inline-block text-sm text-bordeaux underline">
                    {m.summary_file_name ?? "Samenvatting openen"}
                  </a>
                )}
              </div>
            )}
            {!isAdmin && !m.summary && !m.summary_file_id && m.status !== "skipped" && (
              <p className="mt-3 text-xs text-muted">Na deze meeting zet Sabine hier de samenvatting neer.</p>
            )}

            {isAdmin && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-bordeaux">Bewerken en samenvatting toevoegen</summary>
                <form action={saveMeeting} className="mt-3 space-y-3">
                  <input type="hidden" name="coupleId" value={couple.id} />
                  <input type="hidden" name="meetingId" value={m.id} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="label" htmlFor={`t-${m.id}`}>Titel</label>
                      <input id={`t-${m.id}`} name="title" defaultValue={m.title} className="input" />
                    </div>
                    <div>
                      <label className="label" htmlFor={`s-${m.id}`}>Status</label>
                      <select id={`s-${m.id}`} name="status" defaultValue={m.status} className="input">
                        {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor={`d-${m.id}`}>Datum</label>
                      <input id={`d-${m.id}`} name="plannedOn" type="date" defaultValue={m.planned_on ?? ""} className="input" />
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor={`g-${m.id}`}>Wat bespreken we (richtlijn)</label>
                    <textarea id={`g-${m.id}`} name="guide" rows={2} defaultValue={m.guide} className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor={`sum-${m.id}`}>Samenvatting voor het bruidspaar</label>
                    <textarea id={`sum-${m.id}`} name="summary" rows={6} defaultValue={m.summary} className="input" />
                  </div>
                  <div className="text-sm">
                    <label className="label" htmlFor={`f-${m.id}`}>Of upload de samenvatting als bestand</label>
                    <input id={`f-${m.id}`} type="file" name="summaryFile" accept={DOCUMENT_ACCEPT} />
                    {m.summary_file_id && (
                      <label className="ml-3 inline-flex items-center gap-1 text-muted">
                        <input type="checkbox" name="removeFile" /> huidig bestand verwijderen
                      </label>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <SubmitButton className="btn-primary" pendingText="Opslaan…">Opslaan</SubmitButton>
                  </div>
                </form>
                <form action={deleteMeeting} className="mt-2">
                  <input type="hidden" name="coupleId" value={couple.id} />
                  <input type="hidden" name="meetingId" value={m.id} />
                  <SubmitButton className="btn-ghost px-0 text-xs text-bordeaux" confirm={`"${m.title}" verwijderen?`}>Deze meeting verwijderen</SubmitButton>
                </form>
              </details>
            )}
          </li>
        ))}
      </ol>

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <form action={addMeeting}>
            <input type="hidden" name="coupleId" value={couple.id} />
            <SubmitButton className="btn-secondary">+ Meeting</SubmitButton>
          </form>
          {!hasEvaluation && (
            <form action={addMeeting}>
              <input type="hidden" name="coupleId" value={couple.id} />
              <input type="hidden" name="kind" value="evaluation" />
              <SubmitButton className="btn-secondary">+ Evaluatie na de bruiloft</SubmitButton>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
