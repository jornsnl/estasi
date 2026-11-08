import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonPreview } from "@/components/academy/LessonPreview";
import { getStore } from "@/lib/data";
import { editableContent, hasPendingChanges } from "@/lib/domain/publishing";
import { isPublished, MODULE_PACKAGE_LABELS } from "@/lib/domain/visibility";

export const metadata = { title: "Voorbeeld als cursist" };

/**
 * "Voorbeeld als cursist": the lesson as it is in the editor (the concept),
 * shown the way a student will see it. Only in the owner area (the layout
 * checks the role), so students never reach a concept this way.
 */
export default async function LessonPreviewPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const store = getStore();
  const [lesson, settings] = await Promise.all([store.getLesson(lessonId), store.getSettings()]);
  if (!lesson) notFound();
  const parent = await store.getModule(lesson.moduleId);
  const status = !isPublished(lesson)
    ? "Deze les is nog een concept."
    : hasPendingChanges(lesson)
      ? "Dit is het concept met je niet-gepubliceerde wijzigingen; cursisten zien nog de gepubliceerde versie."
      : "Dit is de gepubliceerde versie.";

  return (
    <div className="space-y-8">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-gold/40 bg-gold-soft/95 px-4 py-3 text-sm backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <p>
          <strong>Voorbeeld als cursist.</strong> {status}
          {parent && ` Module: ${parent.title} (${MODULE_PACKAGE_LABELS[parent.packages ?? "AB"].toLowerCase()}${isPublished(parent) ? "" : ", concept"}).`}
        </p>
        <Link href={`/beheer/inhoud/les/${lesson.id}`} className="btn-secondary px-3 py-1.5">Terug naar bewerken</Link>
      </div>
      <LessonPreview content={editableContent(lesson)} privacyNotice={settings.answersPrivacyNotice} />
    </div>
  );
}
