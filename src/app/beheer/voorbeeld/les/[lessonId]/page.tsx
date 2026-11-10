import Link from "next/link";
import { notFound } from "next/navigation";
import type { DraftState } from "@/app/actions/assignment";
import { LessonPreview } from "@/components/academy/LessonPreview";
import { PreviewBar } from "@/components/academy/PreviewBar";
import { previewLinks, previewStudents, previewTarget } from "@/lib/academy-preview";
import { getStore } from "@/lib/data";
import { canOpenLesson } from "@/lib/domain/progress";

export const metadata = { title: "Bekijk als cursist" };

/**
 * "Bekijk als cursist": a lesson as the student sees it, so the published
 * version. With a real student the saved answers are filled in. Nothing is
 * saved, handed in or marked as read.
 */
export default async function PreviewLesson({
  params,
  searchParams,
}: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lessonId } = await params;
  const target = await previewTarget(await searchParams);
  const store = getStore();
  const [lesson, settings, students] = await Promise.all([store.getLesson(lessonId), store.getSettings(), previewStudents()]);
  if (!lesson) notFound();
  const { o } = target;
  const links = previewLinks(target.query);
  // Not in this student's course (concept, hidden, other package): the student would not find it.
  const moduleIndex = o.progress.findIndex((p) => p.lessons.some((l) => l.id === lesson.id));
  if (moduleIndex < 0) notFound();
  const open = canOpenLesson(o.progress, lesson.id);

  const answers = new Map<string, DraftState>(
    o.submissions
      .filter((s) => s.lessonId === lesson.id)
      .map((s) => [
        s.blockId,
        { draft: s.draft, draftVersion: s.draftVersion, status: s.status, feedbackRequested: s.feedbackRequested, questionForSabine: s.questionForSabine, savedAt: s.updatedAt },
      ]),
  );
  const ordered = o.progress.filter((p) => p.state !== "locked").flatMap((p) => p.lessons);
  const position = ordered.findIndex((l) => l.id === lesson.id);
  const prev = position >= 0 ? ordered[position - 1] : undefined;
  const next = position >= 0 ? ordered[position + 1] : undefined;

  return (
    <div>
      <PreviewBar target={target} students={students} active="les" />
      <nav className="mx-auto mb-6 max-w-3xl text-sm text-muted">
        <Link href={links.course} className="hover:text-bordeaux">Mijn opleiding</Link>
        <span className="mx-2">/</span>
        <span>Module {moduleIndex + 1}: {o.progress[moduleIndex].module.title}</span>
      </nav>
      {!open && (
        <p className="mx-auto mb-6 max-w-3xl rounded-lg bg-cream p-3 text-sm text-muted">
          Deze les is voor deze cursist nog vergrendeld: de cursist komt hier pas als de vorige module af is.
        </p>
      )}
      <LessonPreview content={{ title: lesson.title, summary: lesson.summary, blocks: lesson.blocks }} privacyNotice={settings.answersPrivacyNotice} answers={answers} />
      <div className="mx-auto mt-10 flex max-w-3xl justify-between gap-4 border-t border-line pt-6 text-sm">
        {prev ? <Link href={links.lesson(prev.id)} className="btn-ghost">← {prev.title}</Link> : <span />}
        {next ? <Link href={links.lesson(next.id)} className="btn-secondary">{next.title} →</Link> : <span />}
      </div>
    </div>
  );
}
