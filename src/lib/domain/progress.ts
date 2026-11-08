import type {
  Enrollment,
  Lesson,
  LessonCompletion,
  Module,
  Submission,
  SubmissionVersion,
} from "@/lib/data/types";
import { assignmentsOf, isSubmitted } from "./assignment";

export type ModuleState = "locked" | "open" | "completed";

export interface ModuleProgress {
  module: Module;
  lessons: Lesson[];
  completedLessonIds: Set<string>;
  completedCount: number;
  state: ModuleState;
  /** Opened early by the owner for this student. */
  unlockedManually: boolean;
  /** Assignments in this module, and how many of them the student has submitted. */
  assignments: { total: number; submitted: number };
}

export interface ProgressOptions {
  /** Modules the owner opened early for this student. */
  unlocks?: { moduleId: string }[];
  submissions?: Pick<Submission, "lessonId" | "blockId" | "status">[];
}

/**
 * A module unlocks once every lesson of the previous module is completed, or
 * when the owner opened it for this student. Open feedback never holds a
 * student back: a lesson completes as soon as its required assignments are
 * submitted (or it is marked as read when it has none).
 */
export function moduleProgress(
  modules: Module[],
  lessons: Lesson[],
  completions: LessonCompletion[],
  options: ProgressOptions = {},
): ModuleProgress[] {
  const done = new Set(completions.map((c) => c.lessonId));
  const unlocked = new Set((options.unlocks ?? []).map((u) => u.moduleId));
  const submitted = new Set((options.submissions ?? []).filter((s) => isSubmitted(s.status)).map((s) => `${s.lessonId}:${s.blockId}`));
  let previousComplete = true;
  // The caller passes only what the student may see (visibleCourse in visibility.ts).
  return modules
    .map((module) => {
      const moduleLessons = lessons.filter((l) => l.moduleId === module.id);
      const completedLessonIds = new Set(moduleLessons.filter((l) => done.has(l.id)).map((l) => l.id));
      const allDone = moduleLessons.length > 0 && completedLessonIds.size === moduleLessons.length;
      const unlockedManually = unlocked.has(module.id) && !previousComplete;
      const state: ModuleState = !previousComplete && !unlockedManually ? "locked" : allDone ? "completed" : "open";
      // A module without lessons (yet) never holds the next one back.
      if (moduleLessons.length > 0) previousComplete = state === "completed";
      const assignments = moduleLessons.flatMap((l) => assignmentsOf(l.blocks).map((a) => `${l.id}:${a.id}`));
      return {
        module,
        lessons: moduleLessons,
        completedLessonIds,
        completedCount: completedLessonIds.size,
        state,
        unlockedManually,
        assignments: { total: assignments.length, submitted: assignments.filter((k) => submitted.has(k)).length },
      };
    });
}

export const completedModules = (progress: ModuleProgress[]) => progress.filter((p) => p.state === "completed").length;

/** Per module 0-100, for a bar per module. */
export const modulePercent = (p: ModuleProgress) => (p.lessons.length === 0 ? 0 : Math.round((p.completedCount / p.lessons.length) * 100));

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
  | "practical_completed"
  | "expired"
  | "stopped";

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  in_progress: "Bezig",
  awaiting_confirmation: "Wacht op bevestiging",
  online_completed: "Online afgerond",
  practical_completed: "Praktijkervaring afgerond",
  // Access ran out or was revoked before the course was finished.
  expired: "Verlopen",
  stopped: "Gestopt",
};

/** Statuses where the student is no longer working on the course without having finished it. */
export const isUnfinished = (status: CourseStatus | null) => status === "expired" || status === "stopped";

export function courseStatus(
  enrollment: Enrollment,
  percent: number,
  access: "active" | "paused" | "expired" | "revoked" = "active",
): CourseStatus {
  if (enrollment.onlineCompletedAt && enrollment.practicalStatus === "completed") {
    return "practical_completed";
  }
  if (enrollment.onlineCompletedAt) return "online_completed";
  // Everything done: the owner still has to confirm, even when access has run out since.
  if (percent >= 100) return "awaiting_confirmation";
  if (access === "expired") return "expired";
  if (access === "revoked") return "stopped";
  return "in_progress";
}

/** Feedback requests that still wait for the owner (new or being worked on). */
export const openFeedbackCount = (versions: Pick<SubmissionVersion, "feedbackStatus">[]) =>
  versions.filter((v) => v.feedbackStatus === "nieuw" || v.feedbackStatus === "in_behandeling").length;
