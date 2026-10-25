import type {
  Answer,
  AnswerableBlock,
  Block,
  Enrollment,
  Feedback,
  Lesson,
  LessonCompletion,
  Module,
} from "@/lib/data/types";

export const isAnswerable = (block: Block): block is AnswerableBlock =>
  block.type === "question" || block.type === "choice" || block.type === "upload";

export function isAnswered(block: AnswerableBlock, answer: Answer | undefined): boolean {
  if (!answer) return false;
  if (block.type === "choice") return !!answer.choice;
  if (block.type === "upload") return answer.files.length > 0;
  return answer.text.trim().length > 0;
}

/** Required blocks in a lesson that still have no answer. */
export function missingRequired(lesson: Lesson, answers: Answer[]): AnswerableBlock[] {
  const byBlock = new Map(answers.map((a) => [a.blockId, a]));
  return lesson.blocks
    .filter(isAnswerable)
    .filter((b) => b.required && !isAnswered(b, byBlock.get(b.id)));
}

export type ModuleState = "locked" | "open" | "completed";

export interface ModuleProgress {
  module: Module;
  lessons: Lesson[];
  completedLessonIds: Set<string>;
  completedCount: number;
  state: ModuleState;
}

/**
 * A module unlocks once every lesson of the previous module is completed.
 * Lessons only complete when their required questions are answered, so this
 * is the "all required parts done" rule from the plan.
 */
export function moduleProgress(
  modules: Module[],
  lessons: Lesson[],
  completions: LessonCompletion[],
): ModuleProgress[] {
  const done = new Set(completions.map((c) => c.lessonId));
  let previousComplete = true;
  return modules.map((module) => {
    const moduleLessons = lessons.filter((l) => l.moduleId === module.id);
    const completedLessonIds = new Set(moduleLessons.filter((l) => done.has(l.id)).map((l) => l.id));
    const allDone = moduleLessons.length > 0 && completedLessonIds.size === moduleLessons.length;
    const state: ModuleState = !previousComplete ? "locked" : allDone ? "completed" : "open";
    previousComplete = previousComplete && allDone;
    return {
      module,
      lessons: moduleLessons,
      completedLessonIds,
      completedCount: completedLessonIds.size,
      state,
    };
  });
}

export function overallPercent(progress: ModuleProgress[]): number {
  const total = progress.reduce((n, p) => n + p.lessons.length, 0);
  if (total === 0) return 0;
  const done = progress.reduce((n, p) => n + p.completedCount, 0);
  return Math.round((done / total) * 100);
}

/** The first unfinished lesson in an unlocked module: target of "Ga verder". */
export function nextLesson(progress: ModuleProgress[]): Lesson | null {
  for (const p of progress) {
    if (p.state !== "open") continue;
    const lesson = p.lessons.find((l) => !p.completedLessonIds.has(l.id));
    if (lesson) return lesson;
  }
  return null;
}

export function canOpenLesson(progress: ModuleProgress[], lessonId: string): boolean {
  return progress.some((p) => p.state !== "locked" && p.lessons.some((l) => l.id === lessonId));
}

export type CourseStatus =
  | "in_progress"
  | "awaiting_confirmation"
  | "online_completed"
  | "practical_completed";

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  in_progress: "Bezig",
  awaiting_confirmation: "Wacht op bevestiging",
  online_completed: "Online afgerond",
  practical_completed: "Praktijkervaring afgerond",
};

export function courseStatus(enrollment: Enrollment, percent: number): CourseStatus {
  if (enrollment.onlineCompletedAt && enrollment.practicalStatus === "completed") {
    return "practical_completed";
  }
  if (enrollment.onlineCompletedAt) return "online_completed";
  if (percent >= 100) return "awaiting_confirmation";
  return "in_progress";
}

export type FeedbackState = "none" | "open" | "given" | "changed_after_feedback";

/** Feedback state for one answer on an assignment that gets feedback. */
export function feedbackState(answer: Answer | undefined, feedback: Feedback[]): FeedbackState {
  if (!answer) return "none";
  const mine = feedback.filter((f) => f.answerId === answer.id);
  if (mine.length === 0) return "open";
  const latest = Math.max(...mine.map((f) => f.answerVersion));
  return answer.version > latest ? "changed_after_feedback" : "given";
}

/** Answers on feedback assignments that still wait for the owner. */
export function openFeedbackCount(lessons: Lesson[], answers: Answer[], feedback: Feedback[]): number {
  const feedbackBlocks = new Map<string, AnswerableBlock>();
  for (const lesson of lessons) {
    for (const block of lesson.blocks) {
      if (isAnswerable(block) && block.feedback) feedbackBlocks.set(block.id, block);
    }
  }
  return answers.filter((a) => {
    const block = feedbackBlocks.get(a.blockId);
    if (!block || !isAnswered(block, a)) return false;
    const state = feedbackState(a, feedback);
    return state === "open" || state === "changed_after_feedback";
  }).length;
}
