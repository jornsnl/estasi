"use server";

import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/auth/session";
import { getStore, type Answer, type AnswerableBlock } from "@/lib/data";
import { hasLessonAccess } from "@/lib/domain/access";
import { LIMITS } from "@/lib/domain/input";
import { plural } from "@/lib/domain/labels";
import { canOpenLesson, isAnswerable, missingRequired, moduleProgress } from "@/lib/domain/progress";
import { storeUpload, UploadError } from "@/lib/uploads";
import { newId } from "@/lib/util/id";

function next(lessonId: string, key: "melding" | "fout", message: string): never {
  redirect(`/les/${lessonId}?${key}=${encodeURIComponent(message)}#opdrachten`);
}

/** Saves all answers of one lesson, and optionally marks the lesson completed. */
export async function saveLesson(formData: FormData) {
  const user = await requireStudent();
  const store = getStore();
  const lessonId = String(formData.get("lessonId") ?? "");
  const intent = formData.get("intent") === "complete" ? "complete" : "save";

  const [lesson, enrollment, modules, lessons, completions] = await Promise.all([
    store.getLesson(lessonId),
    store.getEnrollmentForUser(user.id),
    store.listModules(),
    store.listLessons(),
    store.listCompletions(user.id),
  ]);
  if (!lesson) redirect("/opleiding");
  if (!hasLessonAccess(enrollment)) redirect("/dashboard");
  if (!canOpenLesson(moduleProgress(modules, lessons, completions), lessonId)) redirect("/opleiding");

  const existing = new Map((await store.listAnswers({ userId: user.id, lessonId })).map((a) => [a.blockId, a]));
  const now = new Date().toISOString();

  // A rejected upload must not cost the student the text typed in the other questions.
  const uploadErrors: string[] = [];
  for (const block of lesson.blocks.filter(isAnswerable)) {
    const before = existing.get(block.id);
    let after: Partial<Answer> | null;
    try {
      after = await applyInput(block, before, formData, user.id);
    } catch (err) {
      if (!(err instanceof UploadError)) throw err;
      uploadErrors.push(err.message);
      continue;
    }
    if (!after) continue;
    const answer: Answer = before
      ? { ...before, ...after, version: before.version + 1, updatedAt: now }
      : { id: newId(), userId: user.id, lessonId, blockId: block.id, text: "", choice: null, files: [], version: 1, createdAt: now, updatedAt: now, ...after };
    await store.saveAnswer(answer);
    existing.set(block.id, answer);
  }

  if (uploadErrors.length > 0) {
    next(lessonId, "fout", `Je andere antwoorden zijn opgeslagen, maar een bestand is niet geüpload: ${uploadErrors.join(" ")}`);
  }
  if (intent === "save") next(lessonId, "melding", "Je antwoorden zijn opgeslagen.");

  const missing = missingRequired(lesson, [...existing.values()]);
  if (missing.length > 0) {
    next(lessonId, "fout", `Je antwoorden zijn opgeslagen. Beantwoord nog ${plural(missing.length, "verplichte vraag", "verplichte vragen")} om de les af te ronden.`);
  }
  if (!completions.some((c) => c.lessonId === lessonId)) {
    await store.setCompletion({ userId: user.id, lessonId, completedAt: now });
  }
  next(lessonId, "melding", "Les afgerond. Mooi werk!");
}

/** Returns the changed fields for one block, or null when nothing changed. */
async function applyInput(
  block: AnswerableBlock,
  before: Answer | undefined,
  formData: FormData,
  userId: string,
): Promise<Partial<Answer> | null> {
  if (block.type === "question") {
    const value = formData.get(`a_${block.id}`);
    if (typeof value !== "string") return null;
    const text = value.slice(0, LIMITS.answer);
    return text === (before?.text ?? "") ? null : { text };
  }
  if (block.type === "choice") {
    // No option ticked means nothing was chosen on this page; never clear an earlier choice
    // (for example one the trainer has since reworded, so it no longer matches an option).
    const value = formData.get(`c_${block.id}`);
    if (typeof value !== "string" || !block.options.includes(value)) return null;
    return value === before?.choice ? null : { choice: value };
  }
  const remove = new Set(formData.getAll(`rm_${block.id}`).map(String));
  const files = (before?.files ?? []).filter((f) => !remove.has(f.id));
  const added = await storeUpload(formData.get(`f_${block.id}`), { belongsTo: userId, uploadedBy: userId });
  if (added) files.push(added);
  return added || remove.size > 0 ? { files } : null;
}
