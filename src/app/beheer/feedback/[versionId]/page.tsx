import Link from "next/link";
import { notFound } from "next/navigation";
import { changeFeedbackStatus, giveFeedback } from "@/app/actions/admin";
import { AnswersView } from "@/components/academy/AnswersView";
import { FeedbackStatusBadge } from "@/components/academy/FeedbackStatusBadge";
import { Badge } from "@/components/Badge";
import { DirtyGuard } from "@/components/DirtyGuard";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { getStore } from "@/lib/data";
import { getSubmissionById, getVersion, listAssignmentFeedback, listVersions } from "@/lib/data/assignments";
import { assignmentTitle, filesIn, STATUS_LABELS } from "@/lib/domain/assignment";
import { ASSESSMENT_LABELS, FEEDBACK_STATUS_LABELS, FEEDBACK_STATUSES } from "@/lib/domain/feedback";
import { LIMITS } from "@/lib/domain/input";
import { ACCEPT_ATTR } from "@/lib/uploads";
import { formatDateTime } from "@/lib/util/format";

export const metadata = { title: "Feedbackverzoek" };

/**
 * Academy 8: one feedback request (or final assignment) in full: who, which
 * module and lesson, the assignment as it was handed in with all answers and
 * files, the question for Sabine; and the feedback form (concept or send,
 * with an attachment and, for a final assignment, the assessment).
 */
export default async function FeedbackScreen({
  params,
  searchParams,
}: {
  params: Promise<{ versionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { versionId } = await params;
  const version = await getVersion(versionId);
  if (!version) notFound();
  const store = getStore();
  const [submission, student, versions, feedback, modules] = await Promise.all([
    getSubmissionById(version.submissionId),
    store.getUser(version.userId),
    listVersions({ submissionId: version.submissionId }),
    listAssignmentFeedback({ userId: version.userId }),
    store.listModules(),
  ]);
  if (!submission || !student) notFound();
  const lesson = await store.getLesson(submission.lessonId);
  const moduleIndex = lesson ? modules.findIndex((m) => m.id === lesson.moduleId) : -1;
  const latest = versions.at(-1);
  const isLatest = latest?.id === version.id;
  const mine = feedback.filter((f) => f.submissionId === submission.id);
  const concept = mine.find((f) => f.versionId === version.id && !f.sentAt);
  const sent = mine.filter((f) => f.sentAt).sort((a, b) => a.sentAt!.localeCompare(b.sentAt!));
  const versionNumber = new Map(versions.map((v) => [v.id, v.version]));
  const files = filesIn(version.answers);
  const graded = version.assignment.graded;
  const canAssess = graded && isLatest && submission.status !== "concept";

  return (
    <div className="space-y-6">
      <header>
        <Link href="/beheer/feedback" className="text-sm text-muted hover:text-bordeaux">← Alle feedbackverzoeken</Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl sm:text-4xl">{assignmentTitle(version.assignment)}</h1>
          {version.feedbackStatus && <FeedbackStatusBadge status={version.feedbackStatus} />}
          {graded && <Badge tone="gold">Eindopdracht · {STATUS_LABELS[submission.status]}</Badge>}
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">Cursist</dt>
          <dd>
            <Link href={`/beheer/cursisten/${student.id}?les=${submission.lessonId}`} className="font-medium text-bordeaux hover:underline">{student.name}</Link>
            <span className="text-muted"> · {student.email}</span>
          </dd>
          <dt className="text-muted">Module</dt>
          <dd>{moduleIndex >= 0 ? `Module ${moduleIndex + 1}: ${modules[moduleIndex].title}` : "Onbekend"}</dd>
          <dt className="text-muted">Les</dt>
          <dd>{lesson?.title ?? "(les verwijderd)"}</dd>
          <dt className="text-muted">Ingediend</dt>
          <dd>
            Versie {version.version} op {formatDateTime(version.submittedAt)}
            {!isLatest && latest && (
              <>
                {" · "}
                <Link href={`/beheer/feedback/${latest.id}`} className="text-bordeaux underline">er is een nieuwere versie ({latest.version})</Link>
              </>
            )}
          </dd>
          <dt className="text-muted">Feedback gevraagd</dt>
          <dd>{version.feedbackRequested ? "Ja" : graded ? "Nee, wacht alleen op je beoordeling" : "Nee"}</dd>
        </dl>
        {versions.length > 1 && (
          <p className="mt-3 flex flex-wrap gap-2 text-sm">
            <span className="text-muted">Versies:</span>
            {versions.map((v) =>
              v.id === version.id ? (
                <span key={v.id} className="font-medium">{v.version}</span>
              ) : (
                <Link key={v.id} href={`/beheer/feedback/${v.id}`} className="text-bordeaux underline">{v.version}</Link>
              ),
            )}
          </p>
        )}
      </header>

      <Notice searchParams={searchParams} />

      {version.questionForSabine && (
        <section className="rounded-lg border border-gold/40 bg-gold-soft/60 p-4">
          <p className="text-xs font-semibold tracking-wide text-gold-ink uppercase">Vraag aan jou</p>
          <p className="mt-1 whitespace-pre-wrap">{version.questionForSabine}</p>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="card p-5 sm:p-6">
          <h2 className="text-2xl">De opdracht zoals ingediend</h2>
          <p className="hint mb-4">Vragen en onderdelen zoals ze in versie {version.version} stonden, met alle antwoorden.</p>
          <AnswersView assignment={version.assignment} answers={version.answers} />
          <div className="mt-6 border-t border-line pt-4">
            <h3 className="font-sans text-base font-semibold">Geüploade bestanden</h3>
            {files.length === 0 ? (
              <p className="text-sm text-muted">Geen bestanden bij deze versie.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {files.map((f) => (
                  <li key={f.id}>
                    <a href={`/api/bestanden/${f.id}`} className="text-bordeaux underline">{f.name}</a>
                    <span className="text-muted"> · {Math.max(1, Math.round(f.size / 1024))} kB</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <div className="space-y-6">
          <section className="card p-5 sm:p-6">
            <h2 className="text-2xl">{concept ? "Concept" : "Feedback geven"}</h2>
            <p className="hint">
              {concept
                ? `Laatst bewaard ${formatDateTime(concept.updatedAt)}. De cursist ziet het pas als je het verstuurt.`
                : "Bewaar als concept om later verder te gaan, of verstuur direct. De cursist krijgt een melding per mail en in de Academy."}
            </p>
            <form action={giveFeedback} className="mt-4 space-y-4" id="feedback-form">
              <DirtyGuard formId="feedback-form" message="Je feedback is nog niet bewaard." />
              <input type="hidden" name="versionId" value={version.id} />
              <div>
                <label htmlFor="fb-text" className="label">Je feedback</label>
                <textarea id="fb-text" name="text" rows={10} maxLength={LIMITS.feedback} defaultValue={concept?.text ?? ""} className="input leading-relaxed" placeholder="Schrijf je feedback…" />
              </div>
              <div>
                <label htmlFor="fb-file" className="label">Bijlage (optioneel)</label>
                {concept?.attachment && (
                  <p className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                    <a href={`/api/bestanden/${concept.attachment.id}`} className="text-bordeaux underline">{concept.attachment.name}</a>
                    <label className="flex items-center gap-1.5 text-muted">
                      <input type="checkbox" name="removeAttachment" value="1" className="accent-[#722F37]" /> verwijderen
                    </label>
                  </p>
                )}
                <input id="fb-file" type="file" name="attachment" accept={ACCEPT_ATTR} className="text-sm" />
                <p className="hint">{concept?.attachment ? "Kies een bestand om de bijlage te vervangen." : "Pdf, Word, Excel, PowerPoint of afbeelding, tot 10 MB."}</p>
              </div>
              {graded && (
                <fieldset>
                  <legend className="label">Beoordeling van de eindopdracht</legend>
                  {canAssess ? (
                    <div className="space-y-2">
                      {(["voldoende", "verbetering_nodig"] as const).map((a) => (
                        <label key={a} className="flex cursor-pointer items-center gap-3 rounded-md border border-line px-3 py-2 has-[:checked]:border-gold has-[:checked]:bg-gold-soft/50">
                          <input type="radio" name="assessment" value={a} defaultChecked={concept?.assessment === a} className="accent-[#722F37]" />
                          <span>{ASSESSMENT_LABELS[a]}</span>
                        </label>
                      ))}
                      <label className="flex cursor-pointer items-center gap-3 rounded-md border border-line px-3 py-2 has-[:checked]:border-gold has-[:checked]:bg-gold-soft/50">
                        <input type="radio" name="assessment" value="" defaultChecked={!concept?.assessment} className="accent-[#722F37]" />
                        <span className="text-muted">Nog niet beoordelen</span>
                      </label>
                      <p className="hint">Bij &quot;Verbetering nodig&quot; kan de cursist een aangepaste versie inleveren. De beoordeling geldt zodra je verstuurt.</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      {isLatest ? "Nog niet ingediend." : "Beoordeel de nieuwste versie."} Huidige status: {STATUS_LABELS[submission.status]}.
                    </p>
                  )}
                </fieldset>
              )}
              <div className="flex flex-wrap gap-2">
                <SubmitButton name="intent" value="send" className="btn-primary" pendingText="Versturen…" confirm={`Feedback versturen naar ${student.name}?`}>
                  Versturen naar cursist
                </SubmitButton>
                <SubmitButton name="intent" value="concept" className="btn-secondary" pendingText="Bewaren…">
                  Opslaan als concept
                </SubmitButton>
                {concept && (
                  <SubmitButton name="intent" value="delete" className="btn-ghost text-bordeaux" confirm="Concept weggooien?">
                    Concept weggooien
                  </SubmitButton>
                )}
              </div>
            </form>
          </section>

          {version.feedbackStatus && (
            <section className="card p-5">
              <form action={changeFeedbackStatus} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="versionId" value={version.id} />
                <div>
                  <label htmlFor="fb-status" className="label">Status van dit verzoek</label>
                  <select id="fb-status" name="status" defaultValue={version.feedbackStatus} className="input w-48">
                    {FEEDBACK_STATUSES.map((s) => (
                      <option key={s} value={s}>{FEEDBACK_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <SubmitButton className="btn-secondary">Status opslaan</SubmitButton>
              </form>
              <p className="hint mt-2">Een concept bewaren zet het verzoek op &quot;in behandeling&quot;, versturen op &quot;afgerond&quot;.</p>
            </section>
          )}

          <section className="card p-5">
            <h2 className="text-xl">Eerder verstuurde feedback</h2>
            {sent.length === 0 && <p className="mt-1 text-sm text-muted">Nog geen feedback verstuurd op deze opdracht.</p>}
            {sent.map((f) => (
              <div key={f.id} className="mt-3 rounded-md border-l-2 border-gold bg-cream/50 p-3 text-sm">
                <p className="text-xs text-muted">
                  Versie {versionNumber.get(f.versionId) ?? "?"} · {formatDateTime(f.sentAt)}
                  {f.assessment && ` · ${ASSESSMENT_LABELS[f.assessment]}`}
                  {f.seenAt ? " · gelezen" : " · nog niet gelezen"}
                </p>
                {f.text && <p className="mt-1 whitespace-pre-wrap">{f.text}</p>}
                {f.attachment && <a href={`/api/bestanden/${f.attachment.id}`} className="text-bordeaux underline">Bijlage: {f.attachment.name}</a>}
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
