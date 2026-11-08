import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { markLessonRead } from "@/app/actions/assignment";
import { AccessNotice } from "@/components/AccessNotice";
import { AssignmentForm, type FeedbackItem, type VersionItem } from "@/components/academy/AssignmentForm";
import { ContentBlock } from "@/components/academy/ContentBlock";
import { Badge } from "@/components/Badge";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { courseProgress } from "@/lib/academy";
import { requireStudent } from "@/lib/auth/session";
import { getStore, type AssignmentAnswers, type AssignmentBlock, type Lesson, type Submission, type SubmissionVersion } from "@/lib/data";
import { feedbackRequestsInModule, listAssignmentFeedback, listVersions, markFeedbackSeen } from "@/lib/data/assignments";
import { hasLessonAccess } from "@/lib/domain/access";
import { assignmentsOf, lessonCompletion } from "@/lib/domain/assignment";
import { canOpenLesson } from "@/lib/domain/progress";

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireStudent();
  const { lessonId } = await params;
  const store = getStore();
  const [lesson, enrollment, settings] = await Promise.all([store.getLesson(lessonId), store.getEnrollmentForUser(user.id), store.getSettings()]);
  if (!lesson) notFound();
  if (!hasLessonAccess(enrollment)) {
    return <AccessNotice enrollment={enrollment} contactEmail={settings.contactEmail} />;
  }
  const { progress, completions, lessons, submissions: allSubmissions } = await courseProgress(user.id, enrollment);
  // A concept, a hidden module or a module of the other package does not exist for this student,
  // also not through a direct link.
  if (!progress.some((p) => p.lessons.some((l) => l.id === lesson.id))) notFound();
  if (!canOpenLesson(progress, lesson.id)) redirect("/opleiding");

  const assignments = assignmentsOf(lesson.blocks);
  const [versions, feedback, slots] = await Promise.all([
    assignments.length ? listVersions({ userId: user.id }) : Promise.resolve([] as SubmissionVersion[]),
    assignments.length ? listAssignmentFeedback({ userId: user.id, sentOnly: true }) : Promise.resolve([]),
    Promise.all(assignments.map((a) => (a.feedbackAllowed ? feedbackRequestsInModule(user.id, lesson.moduleId, { lessonId: lesson.id, blockId: a.id }) : 0))),
  ]);
  const submissions = allSubmissions.filter((s) => s.lessonId === lesson.id);
  const byBlock = new Map(submissions.map((s) => [s.blockId, s]));
  const versionsOf = (s: Submission | undefined) => (s ? versions.filter((v) => v.submissionId === s.id).sort((a, b) => a.version - b.version) : []);
  // Opening the lesson counts as having seen its feedback (the badge in the menu goes); this view still marks it as new.
  const unseen = new Set(feedback.filter((f) => f.sentAt && !f.seenAt && submissions.some((s) => s.id === f.submissionId)).map((f) => f.id));
  if (unseen.size > 0) await markFeedbackSeen(user.id, submissions.map((s) => s.id));

  const moduleIndex = progress.findIndex((p) => p.module.id === lesson.moduleId);
  const currentModule = progress[moduleIndex]?.module;

  // Previous/next within the open part of the course.
  const ordered = progress.filter((p) => p.state !== "locked").flatMap((p) => p.lessons);
  const position = ordered.findIndex((l) => l.id === lesson.id);
  const prev = ordered[position - 1];
  const next = ordered[position + 1];
  const completed = completions.some((c) => c.lessonId === lesson.id);
  const completion = lessonCompletion(lesson.blocks, submissions);

  return (
    <article className="mx-auto max-w-3xl">
      <nav className="mb-6 text-sm text-muted">
        <Link href="/opleiding" className="hover:text-bordeaux">Mijn opleiding</Link>
        <span className="mx-2">/</span>
        <span>Module {moduleIndex + 1}: {currentModule?.title}</span>
      </nav>

      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl sm:text-5xl">{lesson.title}</h1>
          {completed && <Badge tone="success">Afgerond</Badge>}
        </div>
        {lesson.summary && <p className="mt-2 text-lg text-muted">{lesson.summary}</p>}
      </header>

      <div className="space-y-8">
        {lesson.blocks.map((block, i) => {
          const firstAssignment = block.type === "assignment" && !lesson.blocks.slice(0, i).some((b) => b.type === "assignment");
          return (
            <div key={block.id}>
              {firstAssignment && (
                <div id="opdrachten" className="mb-8 scroll-mt-20 border-t border-line pt-8">
                  <h2 className="text-3xl">Opdrachten</h2>
                  <p className="mt-2 text-sm text-muted">{settings.answersPrivacyNotice}</p>
                  <p className="mt-2 text-sm text-muted">Je antwoorden worden vanzelf als concept bewaard. Ben je klaar, dien de opdracht dan in.</p>
                </div>
              )}
              {block.type === "assignment" ? (
                <AssignmentView
                  lessonId={lesson.id}
                  assignment={block}
                  submission={byBlock.get(block.id)}
                  versions={versionsOf(byBlock.get(block.id))}
                  feedback={feedback.filter((f) => f.submissionId === byBlock.get(block.id)?.id)}
                  unseen={unseen}
                  otherRequests={slots[assignments.indexOf(block)]}
                  firstMeasurement={block.repeatOf ? findFirstMeasurement(block.repeatOf, lessons, allSubmissions, versions) : null}
                />
              ) : (
                <ContentBlock block={block} />
              )}
            </div>
          );
        })}
      </div>

      <div id="afronden" className="mt-8 scroll-mt-20 border-t border-line pt-6">
        <Notice searchParams={searchParams} />
        {completed ? (
          <p className="text-sm text-success">Je hebt deze les afgerond.</p>
        ) : completion.byAssignments ? (
          <p className="text-sm text-muted">
            Deze les is afgerond zodra je de verplichte {completion.required.length === 1 ? "opdracht hebt" : "opdrachten hebt"} ingediend
            ({completion.required.length - completion.open.length} van {completion.required.length} ingediend).
          </p>
        ) : (
          <form action={markLessonRead}>
            <input type="hidden" name="lessonId" value={lesson.id} />
            <SubmitButton pendingText="Bezig…">Les afronden</SubmitButton>
          </form>
        )}
      </div>

      <div className="mt-10 flex justify-between gap-4 border-t border-line pt-6 text-sm">
        {prev ? <Link href={`/les/${prev.id}`} className="btn-ghost">← {prev.title}</Link> : <span />}
        {next ? <Link href={`/les/${next.id}`} className="btn-secondary">{next.title} →</Link> : <span />}
      </div>
    </article>
  );
}

/** The earlier measurement a repeated assignment is compared with: its last submitted version, or else its draft. */
function findFirstMeasurement(blockId: string, lessons: Lesson[], submissions: Submission[], versions: SubmissionVersion[]) {
  const original = submissions.find((s) => s.blockId === blockId);
  const definition = lessons.flatMap((l) => assignmentsOf(l.blocks)).find((a) => a.id === blockId);
  const last = original ? versions.filter((v) => v.submissionId === original.id).sort((a, b) => b.version - a.version)[0] : undefined;
  if (last) return { assignment: last.assignment, answers: last.answers, submittedAt: last.submittedAt };
  if (!definition) return null;
  return { assignment: definition, answers: (original?.draft ?? {}) as AssignmentAnswers, submittedAt: null };
}

function AssignmentView({
  lessonId,
  assignment,
  submission,
  versions,
  feedback,
  unseen,
  otherRequests,
  firstMeasurement,
}: {
  lessonId: string;
  assignment: AssignmentBlock;
  submission: Submission | undefined;
  versions: SubmissionVersion[];
  feedback: { id: string; versionId: string; text: string; attachment: FeedbackItem["attachment"]; sentAt: string | null; assessment: FeedbackItem["assessment"] }[];
  unseen: Set<string>;
  otherRequests: number;
  firstMeasurement: ReturnType<typeof findFirstMeasurement>;
}) {
  const versionNumber = new Map(versions.map((v) => [v.id, v.version]));
  const items: FeedbackItem[] = feedback
    .filter((f) => f.sentAt)
    .map((f) => ({
      id: f.id,
      version: versionNumber.get(f.versionId) ?? 1,
      text: f.text,
      attachment: f.attachment,
      sentAt: f.sentAt!,
      assessment: f.assessment,
      isNew: unseen.has(f.id),
    }));
  const versionItems: VersionItem[] = versions.map((v) => ({
    version: v.version,
    submittedAt: v.submittedAt,
    feedbackRequested: v.feedbackRequested,
    feedbackStatus: v.feedbackStatus,
  }));
  return (
    <AssignmentForm
      key={assignment.id}
      lessonId={lessonId}
      assignment={assignment}
      initial={
        submission
          ? {
              draft: submission.draft,
              draftVersion: submission.draftVersion,
              status: submission.status,
              feedbackRequested: submission.feedbackRequested,
              questionForSabine: submission.questionForSabine,
              savedAt: submission.updatedAt,
            }
          : null
      }
      lastSubmitted={versions.at(-1)?.answers ?? null}
      versions={versionItems}
      feedback={items}
      otherFeedbackRequests={otherRequests}
      firstMeasurement={firstMeasurement}
    />
  );
}
