import Link from "next/link";
import { notFound } from "next/navigation";
import { manageAssignment, saveAnswers } from "@/app/actions/ws-fase2";
import { DirtyGuard } from "@/components/DirtyGuard";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { requirePlanning } from "@/lib/ws/access";
import { aiConfigured } from "@/lib/ws/ai";
import { assignmentsFor, questionsFor } from "@/lib/ws/assignments";
import { formatDateTime } from "@/lib/ws/format";

export const metadata = { title: "Opdracht" };

export default async function AssignmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string; assignmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId, assignmentId } = await params;
  const { couple, isAdmin } = await requirePlanning(coupleId);
  const assignment = (await assignmentsFor(couple.id, isAdmin)).find((a) => a.id === assignmentId);
  if (!assignment) notFound();
  const questions = await questionsFor(assignment.id);
  const hidden = { coupleId: couple.id, assignmentId: assignment.id };
  const Hidden = () => <>{Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}</>;

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <Link href={`/k/${couple.id}/opdrachten`} className="text-sm text-muted hover:text-bordeaux">← Opdrachten</Link>
        <h1 className="mt-2 text-3xl">{assignment.title}</h1>
        {assignment.intro && <p className="mt-2 text-sm whitespace-pre-line text-muted">{assignment.intro}</p>}
        {assignment.submitted_at && <p className="mt-2 text-sm text-success">Ingestuurd op {formatDateTime(assignment.submitted_at)}. Aanpassen kan nog steeds.</p>}
      </header>
      <Notice searchParams={searchParams} />

      {(assignment.ai_summary || assignment.ai_error || assignment.submitted_at) && (
        <section className="card p-5">
          <h2 className="text-lg">Samenvatting</h2>
          {assignment.ai_summary ? (
            <>
              <p className="mt-2 text-sm whitespace-pre-line">{assignment.ai_summary}</p>
              <p className="mt-2 text-xs text-muted">Automatisch samengevat{assignment.ai_summary_at ? ` op ${formatDateTime(assignment.ai_summary_at)}` : ""}{isAdmin ? "; je kunt hem hieronder aanpassen." : "."}</p>
            </>
          ) : assignment.ai_error && isAdmin ? (
            <p className="mt-2 text-sm text-bordeaux">Samenvatten is niet gelukt: {assignment.ai_error}</p>
          ) : (
            <p className="mt-2 text-sm text-muted">{aiConfigured() ? "De samenvatting wordt gemaakt. Ververs de pagina over een minuutje." : "Sabine leest jullie antwoorden en neemt ze mee in jullie volgende gesprek."}</p>
          )}
          {isAdmin && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-bordeaux">Samenvatting aanpassen</summary>
              <form action={manageAssignment} className="mt-2 space-y-2">
                <Hidden />
                <input type="hidden" name="intent" value="saveSummary" />
                <textarea name="summary" rows={8} defaultValue={assignment.ai_summary} className="input" aria-label="Samenvatting" />
                <SubmitButton className="btn-primary">Opslaan</SubmitButton>
              </form>
              {aiConfigured() && (
                <form action={manageAssignment} className="mt-2">
                  <Hidden />
                  <input type="hidden" name="intent" value="summarise" />
                  <SubmitButton className="btn-secondary" pendingText="Samenvatten…">Opnieuw laten samenvatten</SubmitButton>
                </form>
              )}
            </details>
          )}
        </section>
      )}

      <form id="answers" action={saveAnswers} className="space-y-4">
        <Hidden />
        {questions.map((q, i) => (
          <div key={q.id} className="card p-5">
            <label htmlFor={`a-${q.id}`} className="block font-medium">{i + 1}. {q.prompt}</label>
            {q.help && <p className="hint">{q.help}</p>}
            <textarea id={`a-${q.id}`} name={`a-${q.id}`} rows={4} defaultValue={q.answer} className="input mt-2" />
          </div>
        ))}
        {questions.length === 0 && <p className="card p-5 text-sm text-muted">Deze opdracht heeft nog geen vragen.</p>}
        {questions.length > 0 && (
          <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-line bg-cream/95 px-4 py-3 backdrop-blur">
            <DirtyGuard formId="answers" />
            <SubmitButton name="intent" value="save" className="btn-secondary" pendingText="Opslaan…">Tussentijds opslaan</SubmitButton>
            <SubmitButton name="intent" value="submit" className="btn-primary" pendingText="Insturen…">{assignment.submitted_at ? "Opslaan en opnieuw insturen" : "Insturen"}</SubmitButton>
          </div>
        )}
      </form>

      {isAdmin && (
        <section className="card space-y-4 p-5">
          <h2 className="text-lg">Opdracht beheren</h2>
          <form action={manageAssignment} className="grid gap-3 sm:grid-cols-2">
            <Hidden />
            <input type="hidden" name="intent" value="save" />
            <div className="sm:col-span-2"><label className="label" htmlFor="title">Titel</label><input id="title" name="title" defaultValue={assignment.title} className="input" /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="intro">Uitleg</label><textarea id="intro" name="intro" rows={3} defaultValue={assignment.intro} className="input" /></div>
            <div><label className="label" htmlFor="visibleFrom">Zichtbaar vanaf (leeg = meteen)</label><input id="visibleFrom" name="visibleFrom" type="date" defaultValue={assignment.visible_from ?? ""} className="input" /></div>
            <label className="flex items-end gap-2 pb-3 text-sm"><input type="checkbox" name="stylingSource" defaultChecked={assignment.styling_source} className="accent-[#6B1E2E]" /> Basis voor het stylingplan</label>
            <div className="sm:col-span-2"><SubmitButton className="btn-primary">Opslaan</SubmitButton></div>
          </form>
          <div className="border-t border-line pt-4">
            <h3 className="mb-2 font-sans text-sm font-medium">Vragen</h3>
            <ul className="space-y-1.5 text-sm">
              {questions.map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-2 rounded-lg bg-cream px-3 py-1.5">
                  <span>{q.prompt}</span>
                  <form action={manageAssignment}>
                    <Hidden />
                    <input type="hidden" name="intent" value="deleteQuestion" />
                    <input type="hidden" name="questionId" value={q.id} />
                    <SubmitButton className="text-xs text-muted hover:text-bordeaux" confirm="Deze vraag (en het antwoord) verwijderen?">Verwijderen</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
            <form action={manageAssignment} className="mt-2 grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
              <Hidden />
              <input type="hidden" name="intent" value="addQuestion" />
              <input name="prompt" required placeholder="Nieuwe vraag" aria-label="Nieuwe vraag" className="input py-1.5" />
              <input name="help" placeholder="Toelichting (optioneel)" aria-label="Toelichting" className="input py-1.5" />
              <SubmitButton className="btn-secondary py-1.5">Toevoegen</SubmitButton>
            </form>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {assignment.submitted_at && (
              <form action={manageAssignment}><Hidden /><input type="hidden" name="intent" value="reopen" /><SubmitButton className="btn-secondary">Weer openzetten</SubmitButton></form>
            )}
            <form action={manageAssignment}><Hidden /><input type="hidden" name="intent" value="delete" /><SubmitButton className="btn-ghost text-bordeaux" confirm="Deze opdracht met alle antwoorden verwijderen?">Opdracht verwijderen</SubmitButton></form>
          </div>
        </section>
      )}
    </div>
  );
}
