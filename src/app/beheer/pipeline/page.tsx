import Link from "next/link";
import { createLeadAction } from "@/app/actions/pipeline";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { LeadFields } from "@/components/pipeline/LeadFields";
import { PipelineBoard, type BoardLead } from "@/components/pipeline/PipelineBoard";
import { PipelineForecast } from "@/components/pipeline/PipelineForecast";
import { CLOSED_DAYS, INTEREST_LABELS, OPEN_STAGES, SOURCE_LABELS, STAGES, STAGE_COLORS, STAGE_LABELS, followUpDue } from "@/lib/pipeline/rules";
import { listLeads, type Lead } from "@/lib/pipeline/server";
import { formatDate, formatMoney, todayIso } from "@/lib/ws/format";

export const metadata = { title: "Pipeline" };

const shortDate = (value: string | Date) =>
  new Date(typeof value === "string" ? `${value}T12:00:00Z` : value).toLocaleDateString("nl-NL", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" });

/**
 * Sabine's salespipeline: every lead for weddingplanning, the opening dance and
 * the Academy on one board, from Nieuw to Geboekt. Modelled on the pipeline of
 * SVB Solutions; see the README, "Salespipeline".
 */
export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const list = params.weergave === "lijst";
  const showNew = params.nieuw === "1";
  const leads = await listLeads();
  const today = todayIso();

  const open = leads.filter((l) => OPEN_STAGES.includes(l.stage));
  const openValue = open.reduce((sum, l) => sum + (l.value_cents ?? 0), 0);
  const won = leads.filter((l) => l.stage === "geboekt").length;
  const lost = leads.filter((l) => l.stage === "afgevallen").length;
  const due = leads.filter((l) => followUpDue(l, today));
  const base = list ? "/beheer/pipeline?weergave=lijst" : "/beheer/pipeline";

  const board: BoardLead[] = leads.map((l) => ({
    id: l.id,
    title: l.title,
    contactName: l.contact_name,
    interest: l.interest,
    sourceLabel: SOURCE_LABELS[l.source],
    stage: l.stage,
    position: l.position,
    valueCents: l.value_cents,
    valueLabel: l.value_cents ? formatMoney(l.value_cents) : "",
    weddingDateLabel: l.wedding_date ? formatDate(l.wedding_date) : "",
    nextAction: l.next_action,
    nextActionDate: l.next_action_date,
    nextActionLabel: l.next_action_date ? shortDate(l.next_action_date) : "",
    createdLabel: shortDate(l.created_at),
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Beheer</p>
          <h1 className="mt-1 text-3xl">Pipeline</h1>
          <p className="mt-1 text-sm text-muted">
            {open.length} open {open.length === 1 ? "lead" : "leads"}
            {openValue > 0 && <> · {formatMoney(openValue)} in de pijplijn</>} · {won} geboekt, {lost} afgevallen (laatste {CLOSED_DAYS} dagen)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-line text-xs">
            <Link href="/beheer/pipeline" className={`px-3 py-2 ${!list ? "bg-bordeaux text-white" : "bg-white text-muted hover:text-ink"}`}>Bord</Link>
            <Link href="/beheer/pipeline?weergave=lijst" className={`px-3 py-2 ${list ? "bg-bordeaux text-white" : "bg-white text-muted hover:text-ink"}`}>Lijst</Link>
          </div>
          <Link href="/beheer/omzet" className="btn-secondary">Omzet</Link>
          <Link href={`${base}${list ? "&" : "?"}nieuw=1`} className="btn-primary">Nieuwe lead</Link>
        </div>
      </header>
      <Notice searchParams={searchParams} />

      {showNew && (
        <form action={createLeadAction} className="card max-w-3xl space-y-4 p-5">
          <p className="eyebrow">Nieuwe lead</p>
          <LeadFields compact />
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label" htmlFor="stage">Fase</label>
              <select id="stage" name="stage" defaultValue="nieuw" className="input">
                {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
              </select>
            </div>
            <SubmitButton pendingText="Aanmaken…">Aanmaken</SubmitButton>
            <Link href={base} className="btn-ghost">Annuleren</Link>
          </div>
        </form>
      )}

      <PipelineForecast leads={open} />

      {due.length > 0 && (
        <section className="card border border-bordeaux/30 p-4">
          <h2 className="text-lg">Opvolgen{due.length > 1 ? ` (${due.length})` : ""}</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {due.map((l) => (
              <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2">
                <Link href={`/beheer/pipeline/${l.id}`} className="hover:text-bordeaux">
                  <strong>{l.title}</strong>
                  {l.next_action && <span className="text-muted"> · {l.next_action}</span>}
                </Link>
                <span className={`text-xs ${l.next_action_date! < today ? "text-bordeaux" : "text-muted"}`}>
                  {l.next_action_date === today ? "vandaag" : formatDate(l.next_action_date)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {leads.length === 0 && !showNew ? (
        <p className="card px-4 py-10 text-center text-sm text-muted">
          Nog geen leads. Zet iedereen die interesse toont hier neer met &quot;Nieuwe lead&quot;, of laat Claude een lead aanmaken via de koppeling.
        </p>
      ) : list ? (
        <LeadTable leads={leads} />
      ) : (
        <PipelineBoard leads={board} today={today} />
      )}
    </div>
  );
}

function LeadTable({ leads }: { leads: Lead[] }) {
  const sorted = [...leads].sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || a.position - b.position);
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="table-head">
          <tr>
            <th className="px-4 py-2.5">Fase</th>
            <th className="px-4 py-2.5">Lead</th>
            <th className="px-4 py-2.5">Interesse</th>
            <th className="px-4 py-2.5">Trouwdatum</th>
            <th className="px-4 py-2.5">Bron</th>
            <th className="px-4 py-2.5 text-right">Waarde</th>
            <th className="px-4 py-2.5">Volgende stap</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((l) => (
            <tr key={l.id} className="border-t border-line hover:bg-cream/50">
              <td className="px-4 py-3">
                <span className="flex items-center gap-2 text-xs text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STAGE_COLORS[l.stage] }} />
                  {STAGE_LABELS[l.stage]}
                </span>
              </td>
              <td className="px-4 py-3">
                <Link href={`/beheer/pipeline/${l.id}`} className="font-medium hover:text-bordeaux">{l.title}</Link>
                {l.contact_name && l.contact_name !== l.title && <p className="text-xs text-muted">{l.contact_name}</p>}
              </td>
              <td className="px-4 py-3">{INTEREST_LABELS[l.interest]}</td>
              <td className="px-4 py-3">{l.wedding_date ? formatDate(l.wedding_date) : "–"}</td>
              <td className="px-4 py-3 text-muted">{SOURCE_LABELS[l.source]}</td>
              <td className="px-4 py-3 text-right tabular-nums">{l.value_cents ? formatMoney(l.value_cents) : "–"}</td>
              <td className="px-4 py-3 text-xs text-muted">
                {l.next_action_date ? formatDate(l.next_action_date) : ""}
                {l.next_action && <span className="block">{l.next_action}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
