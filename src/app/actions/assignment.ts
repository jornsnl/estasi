"use server";

import { redirect } from "next/navigation";
import { courseProgress } from "@/lib/academy";
import { requireStudent } from "@/lib/auth/session";
import { getFiles, getStore, type AssignmentAnswers, type AssignmentBlock, type Lesson, type Submission, type SubmissionStatus, type User } from "@/lib/data";
import { addDraftFile, listSubmissions, saveDraft, submitAssignment as submitInDb, type DraftInput } from "@/lib/data/assignments";
import { hasLessonAccess } from "@/lib/domain/access";
import { allFields, lessonCompletion, uploadProblem } from "@/lib/domain/assignment";
import { canOpenLesson } from "@/lib/domain/progress";

/** What the assignment form in the browser keeps of the saved submission. */
export interface DraftState {
  draft: AssignmentAnswers;
  draftVersion: number;
  status: SubmissionStatus;
  feedbackRequested: boolean;
  questionForSabine: string;
  savedAt: string;
}

export type DraftResponse =
  | { ok: true; state: DraftState; feedbackRefused?: boolean }
  | { ok: false; conflict: true; state: DraftState }
  | { ok: false; conflict?: false; error: string };

export type SubmitResponse =
  | { ok: true; state: DraftState; feedbackRefused?: boolean; lessonCompleted: boolean; version: number }
  | { ok: false; conflict: true; state: DraftState }
  | { ok: false; conflict?: false; missing: string[]; state: DraftState; feedbackRefused?: boolean }
  | { ok: false; conflict?: false; missing?: undefined; error: string };

export interface DraftRequest {
  lessonId: string;
  blockId: string;
  expectedVersion: number;
  answers: unknown;
  feedbackRequested: boolean;
  questionForSabine: string;
  force?: boolean;
}

const toState = (s: Submission): DraftState => ({
  draft: s.draft,
  draftVersion: s.draftVersion,
  status: s.status,
  feedbackRequested: s.feedbackRequested,
  questionForSabine: s.questionForSabine,
  savedAt: s.updatedAt,
});

class Refused extends Error {}

/** The student, the lesson and the assignment, after checking access and that the lesson is open. */
async function context(lessonId: unknown, blockId: unknown): Promise<{ user: User; lesson: Lesson; assignment: AssignmentBlock }> {
  const user = await requireStudent();
  const store = getStore();
  const lesson = typeof lessonId === "string" ? await store.getLesson(lessonId) : null;
  if (!lesson) throw new Refused("Deze les bestaat niet meer. Ververs de pagina.");
  const enrollment = await store.getEnrollmentForUser(user.id);
  if (!hasLessonAccess(enrollment)) throw new Refused("Je toegang tot de opleiding is niet actief. Je antwoorden zijn niet opgeslagen.");
  const { progress } = await courseProgress(user.id, enrollment);
  if (!canOpenLesson(progress, lesson.id)) throw new Refused("Deze les is (nog) niet beschikbaar voor jou.");
  const assignment = lesson.blocks.find((b): b is AssignmentBlock => b.type === "assignment" && b.id === blockId);
  if (!assignment) throw new Refused("Deze opdracht staat niet meer in de les. Ververs de pagina.");
  return { user, lesson, assignment };
}

function draftInput(ctx: { user: User; lesson: Lesson; assignment: AssignmentBlock }, req: DraftRequest): DraftInput & { lesson: Lesson } {
  return {
    userId: ctx.user.id,
    lesson: ctx.lesson,
    assignment: ctx.assignment,
    expectedVersion: Number.isInteger(req.expectedVersion) ? req.expectedVersion : -1,
    answers: req.answers,
    feedbackRequested: req.feedbackRequested === true,
    questionForSabine: typeof req.questionForSabine === "string" ? req.questionForSabine : "",
    force: req.force === true,
  };
}

const refusal = (err: unknown) => {
  if (err instanceof Refused) return { ok: false as const, error: err.message };
  throw err;
};

/** Autosave and "concept bewaren": always allowed, also with required fields still empty. */
export async function saveAssignmentDraft(req: DraftRequest): Promise<DraftResponse> {
  try {
    const ctx = await context(req?.lessonId, req?.blockId);
    const result = await saveDraft(draftInput(ctx, req));
    if (!result.ok) return { ok: false, conflict: true, state: toState(result.submission) };
    return { ok: true, state: toState(result.submission), feedbackRefused: result.feedbackRefused };
  } catch (err) {
    return refusal(err);
  }
}

/** Uploads one file into an upload field of the draft. Type, size and number are checked here. */
export async function uploadAssignmentFile(formData: FormData): Promise<DraftResponse> {
  try {
    const ctx = await context(formData.get("lessonId"), formData.get("blockId"));
    const field = allFields(ctx.assignment).find((f) => f.id === formData.get("fieldId"));
    if (!field || field.type !== "upload") throw new Refused("Dit uploadveld bestaat niet meer. Ververs de pagina.");
    const file = formData.get("file");
    if (!file || typeof file === "string") throw new Refused("Kies eerst een bestand.");
    const submissions = await listSubmissions({ userId: ctx.user.id, lessonId: ctx.lesson.id });
    const current = submissions.find((s) => s.blockId === ctx.assignment.id);
    const problem = uploadProblem(field, file, current?.draft?.[field.id]?.files?.length ?? 0);
    if (problem) throw new Refused(problem);
    const stored = await getFiles().save(Buffer.from(await file.arrayBuffer()), {
      name: file.name.slice(0, 200),
      mime: file.type,
      belongsTo: ctx.user.id,
      uploadedBy: ctx.user.id,
    });
    const result = await addDraftFile(ctx.user.id, ctx.lesson.id, ctx.assignment, field, stored);
    if (!result.ok) throw new Refused(result.error);
    return { ok: true, state: toState(result.submission) };
  } catch (err) {
    return refusal(err);
  }
}

/** Hands the assignment in (a new version each time); refuses with the list of empty required fields. */
export async function submitAssignment(req: DraftRequest): Promise<SubmitResponse> {
  try {
    const ctx = await context(req?.lessonId, req?.blockId);
    const result = await submitInDb(draftInput(ctx, req));
    if (!result.ok && result.reason === "conflict") return { ok: false, conflict: true, state: toState(result.submission) };
    if (!result.ok && result.reason === "assessed") return { ok: false, error: "Deze opdracht is al beoordeeld als voldoende; een nieuwe versie is niet nodig." };
    if (!result.ok) return { ok: false, missing: result.missing, state: toState(result.submission), feedbackRefused: result.feedbackRefused };
    return {
      ok: true,
      state: toState(result.submission),
      feedbackRefused: result.feedbackRefused,
      lessonCompleted: result.lessonCompleted,
      version: result.version.version,
    };
  } catch (err) {
    return refusal(err);
  }
}

/** "Les afronden" for a lesson without required assignments (marked as read). */
export async function markLessonRead(formData: FormData) {
  const lessonId = String(formData.get("lessonId") ?? "");
  const user = await requireStudent();
  const store = getStore();
  const lesson = await store.getLesson(lessonId);
  if (!lesson) redirect("/opleiding");
  const enrollment = await store.getEnrollmentForUser(user.id);
  if (!hasLessonAccess(enrollment)) redirect("/dashboard");
  const { progress, completions, submissions } = await courseProgress(user.id, enrollment);
  if (!canOpenLesson(progress, lesson.id)) redirect("/opleiding");
  const completion = lessonCompletion(lesson.blocks, submissions.filter((s) => s.lessonId === lesson.id));
  const back = (key: string, message: string): never => redirect(`/les/${lesson.id}?${key}=${encodeURIComponent(message)}#afronden`);
  if (completion.byAssignments && !completion.complete) {
    back("fout", "Dien eerst de verplichte opdrachten in; dan is de les vanzelf afgerond.");
  }
  if (!completions.some((c) => c.lessonId === lesson.id)) {
    await store.setCompletion({ userId: user.id, lessonId: lesson.id, completedAt: new Date().toISOString() });
  }
  back("melding", "Les afgerond. Mooi werk!");
}
