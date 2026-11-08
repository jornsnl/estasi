import Link from "next/link";
import { AnswersView } from "@/components/academy/AnswersView";
import { FeedbackStatusBadge } from "@/components/academy/FeedbackStatusBadge";
import { ScanComparisonTable } from "@/components/academy/ScanComparisonTable";
import { Badge } from "@/components/Badge";
import type { AssignmentAnswers, AssignmentBlock, AssignmentFeedback, Submission, SubmissionVersion } from "@/lib/data/types";
import { assignmentTitle, compareScans, isSubmitted, STATUS_LABELS } from "@/lib/domain/assignment";
import { ASSESSMENT_LABELS } from "@/lib/domain/feedback";
import { formatDateTime } from "@/lib/util/format";

/**
 * One assignment of a student on the student page in the admin: the draft or
 * the handed-in versions with their answers and feedback. Feedback and the
 * assessment of a final assignment are given on the feedback screen
 * (/beheer/feedback/[versionId]).
 */
export function SubmissionPanel({
  assignment,
  submission,
  versions,
  feedback,
  original,
}: {
  assignment: AssignmentBlock;
  submission: Submission | undefined;
  versions: SubmissionVersion[];
  feedback: AssignmentFeedback[];
  original: { assignment: AssignmentBlock; answers: AssignmentAnswers } | null;
}) {
  const latest = versions.at(-1);
  return (
    <div className="rounded-lg bg-cream/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{assignmentTitle(assignment)}</p>
        {assignment.requiredForLesson && <Badge tone="bordeaux">Verplicht</Badge>}
        {assignment.feedbackAllowed && <Badge tone="gold">Feedback mogelijk</Badge>}
        {assignment.graded && <Badge tone="gold">Eindopdracht</Badge>}
        <Badge tone={submission && isSubmitted(submission.status) ? "success" : "neutral"}>{submission ? STATUS_LABELS[submission.status] : "Nog niet begonnen"}</Badge>
        {latest && (
          <Link href={`/beheer/feedback/${latest.id}`} className="btn-secondary ml-auto px-3 py-1.5 text-xs">
            {assignment.graded ? "Feedback en beoordeling" : "Feedback geven"}
          </Link>
        )}
      </div>

      {!latest && submission && (
        <div className="mt-3">
          <p className="mb-2 text-xs text-muted">Concept, laatst opgeslagen {formatDateTime(submission.updatedAt)} (nog niet ingediend):</p>
          <AnswersView assignment={assignment} answers={submission.draft} />
        </div>
      )}
      {!submission && <p className="mt-2 text-sm text-muted">Nog niets ingevuld.</p>}

      {versions
        .slice()
        .reverse()
        .map((v) => {
          const items = feedback.filter((f) => f.versionId === v.id);
          return (
            <details key={v.id} open={v.id === latest?.id} className="mt-3 rounded-md border border-line bg-white p-3">
              <summary className="cursor-pointer text-sm">
                Versie {v.version} · ingediend {formatDateTime(v.submittedAt)}
                {v.feedbackRequested && <span className="ml-2 text-bordeaux">feedback gevraagd</span>}
                {v.feedbackStatus && <span className="ml-2"><FeedbackStatusBadge status={v.feedbackStatus} /></span>}
              </summary>
              <div className="mt-3">
                {v.questionForSabine && (
                  <p className="mb-3 rounded-md bg-gold-soft/60 p-3 text-sm">
                    <span className="font-medium">Vraag aan jou:</span> {v.questionForSabine}
                  </p>
                )}
                <AnswersView assignment={v.assignment} answers={v.answers} />
                {original && v.id === latest?.id && (
                  <div className="mt-4">
                    <p className="text-sm font-medium">Vergelijking met de beginmeting</p>
                    <ScanComparisonTable comparison={compareScans(original, { assignment: v.assignment, answers: v.answers })} afterLabel="Eind" />
                  </div>
                )}
                {items.map((f) => (
                  <div key={f.id} className="mt-3 rounded-md border-l-2 border-gold bg-cream/40 p-3 text-sm">
                    <p className="text-xs text-muted">
                      Jouw feedback · {formatDateTime(f.sentAt ?? f.updatedAt)}
                      {!f.sentAt && " · concept, nog niet verstuurd"}
                      {f.assessment && ` · ${ASSESSMENT_LABELS[f.assessment]}`}
                    </p>
                    {f.text && <p className="mt-1 whitespace-pre-wrap">{f.text}</p>}
                    {f.attachment && <a href={`/api/bestanden/${f.attachment.id}`} className="text-bordeaux underline">Bijlage: {f.attachment.name}</a>}
                  </div>
                ))}
                <Link href={`/beheer/feedback/${v.id}`} className="mt-3 inline-block text-sm text-bordeaux underline">
                  Feedbackscherm van versie {v.version} openen
                </Link>
              </div>
            </details>
          );
        })}
    </div>
  );
}
