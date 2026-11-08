import "server-only";
import { getStore, type Enrollment, type Lesson, type LessonCompletion, type Module, type ModuleUnlock, type Submission, type SubmissionVersion, type User } from "@/lib/data";
import { listSubmissions, listUnlocks, listVersions } from "@/lib/data/assignments";
import { accessStatus, type AccessStatus } from "@/lib/domain/access";
import { isSubmitted } from "@/lib/domain/assignment";
import {
  completedModules,
  courseStatus,
  moduleProgress,
  nextLesson,
  openFeedbackCount,
  overallPercent,
  type CourseStatus,
  type ModuleProgress,
} from "@/lib/domain/progress";
import { visibleCourse } from "@/lib/domain/visibility";
import { newId } from "@/lib/util/id";

export interface CourseProgress {
  modules: Module[];
  lessons: Lesson[];
  completions: LessonCompletion[];
  unlocks: ModuleUnlock[];
  submissions: Submission[];
  /** Only the published modules of the student's package (visibleCourse). */
  progress: ModuleProgress[];
}

/** One student's way through the course: what is open, completed and handed in. */
export async function courseProgress(userId: string, enrollment: Enrollment | null): Promise<CourseProgress> {
  const store = getStore();
  const [modules, lessons, completions, unlocks, submissions] = await Promise.all([
    store.listModules(),
    store.listLessons(),
    store.listCompletions(userId),
    listUnlocks(userId),
    listSubmissions({ userId }),
  ]);
  // Only the published modules and lessons of the student's own package count (and can be opened).
  const course = visibleCourse(modules, lessons, enrollment);
  const progress = moduleProgress(course.modules, course.lessons, completions, { unlocks, submissions });
  return { modules, lessons, completions, unlocks, submissions, progress };
}

export interface StudentOverview {
  user: User;
  enrollment: Enrollment | null;
  access: AccessStatus | "none";
  progress: ModuleProgress[];
  percent: number;
  status: CourseStatus | null;
  /** Feedback requests that still wait for the owner. */
  openFeedback: number;
  completedModules: number;
  /** Assignments handed in (at least once), in the student's modules. */
  submittedAssignments: number;
  submissions: Submission[];
  versions: SubmissionVersion[];
}

/** Everything the dashboards need about one student's progress. */
export async function studentOverview(user: User): Promise<StudentOverview> {
  const enrollment = await getStore().getEnrollmentForUser(user.id);
  const [course, versions] = await Promise.all([courseProgress(user.id, enrollment), listVersions({ userId: user.id })]);
  const { progress, submissions } = course;
  const percent = overallPercent(progress);
  const access = enrollment ? accessStatus(enrollment) : "none";
  const visibleLessons = new Set(progress.flatMap((p) => p.lessons.map((l) => l.id)));
  return {
    user,
    enrollment,
    access,
    progress,
    percent,
    status: enrollment && access !== "none" ? courseStatus(enrollment, percent, access) : null,
    openFeedback: openFeedbackCount(versions),
    completedModules: completedModules(progress),
    submittedAssignments: submissions.filter((s) => isSubmitted(s.status) && visibleLessons.has(s.lessonId)).length,
    submissions,
    versions,
  };
}

export { nextLesson };

export async function audit(actor: User, action: string, details = "", targetUserId: string | null = null) {
  await getStore().addAudit({
    id: newId(),
    at: new Date().toISOString(),
    actorId: actor.id,
    targetUserId,
    action,
    details,
  });
}

export async function touchActivity(user: User) {
  const last = user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : 0;
  // Write at most every 10 minutes to keep the local file quiet.
  if (Date.now() - last > 10 * 60_000) {
    await getStore().updateUser(user.id, { lastActiveAt: new Date().toISOString() });
  }
}
