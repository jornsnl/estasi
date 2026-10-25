import "server-only";
import { getStore, type Enrollment, type User } from "@/lib/data";
import { accessStatus, type AccessStatus } from "@/lib/domain/access";
import {
  courseStatus,
  moduleProgress,
  nextLesson,
  openFeedbackCount,
  overallPercent,
  type CourseStatus,
  type ModuleProgress,
} from "@/lib/domain/progress";
import { newId } from "@/lib/util/id";

export interface StudentOverview {
  user: User;
  enrollment: Enrollment | null;
  access: AccessStatus | "none";
  progress: ModuleProgress[];
  percent: number;
  status: CourseStatus | null;
  openFeedback: number;
}

/** Everything the dashboards need about one student's progress. */
export async function studentOverview(user: User): Promise<StudentOverview> {
  const store = getStore();
  const [enrollment, modules, lessons, completions, answers, feedback] = await Promise.all([
    store.getEnrollmentForUser(user.id),
    store.listModules(),
    store.listLessons(),
    store.listCompletions(user.id),
    store.listAnswers({ userId: user.id }),
    store.listFeedback({ userId: user.id }),
  ]);
  const progress = moduleProgress(modules, lessons, completions);
  const percent = overallPercent(progress);
  return {
    user,
    enrollment,
    access: enrollment ? accessStatus(enrollment) : "none",
    progress,
    percent,
    status: enrollment ? courseStatus(enrollment, percent) : null,
    openFeedback: openFeedbackCount(lessons, answers, feedback),
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
