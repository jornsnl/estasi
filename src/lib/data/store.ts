import type {
  Answer,
  AuditEntry,
  Enrollment,
  Feedback,
  FileRef,
  Lesson,
  LessonCompletion,
  Module,
  Profile,
  Settings,
  User,
} from "./types";

/**
 * Everything the Academy needs from persistence. Implemented by PgDataStore
 * (pg-store.ts) on the tables in schema public (supabase/migrations).
 */
export interface DataStore {
  // Users
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  listUsers(role?: User["role"]): Promise<User[]>;
  createUser(user: User): Promise<User>;
  updateUser(id: string, patch: Partial<User>): Promise<User>;

  // Profiles
  getProfile(userId: string): Promise<Profile | null>;
  saveProfile(profile: Profile): Promise<Profile>;

  // Enrollments
  getEnrollmentForUser(userId: string): Promise<Enrollment | null>;
  listEnrollments(): Promise<Enrollment[]>;
  createEnrollment(enrollment: Enrollment): Promise<Enrollment>;
  updateEnrollment(id: string, patch: Partial<Enrollment>): Promise<Enrollment>;

  // Content
  listModules(): Promise<Module[]>;
  getModule(id: string): Promise<Module | null>;
  saveModule(module: Module): Promise<Module>;
  deleteModule(id: string): Promise<void>;
  listLessons(moduleId?: string): Promise<Lesson[]>;
  getLesson(id: string): Promise<Lesson | null>;
  saveLesson(lesson: Lesson): Promise<Lesson>;
  deleteLesson(id: string): Promise<void>;

  // Answers, feedback and progress
  listAnswers(filter: { userId?: string; lessonId?: string }): Promise<Answer[]>;
  saveAnswer(answer: Answer): Promise<Answer>;
  getAnswer(id: string): Promise<Answer | null>;
  listFeedback(filter: { userId?: string; answerId?: string }): Promise<Feedback[]>;
  createFeedback(feedback: Feedback): Promise<Feedback>;
  listCompletions(userId?: string): Promise<LessonCompletion[]>;
  setCompletion(completion: LessonCompletion): Promise<void>;

  // Audit log and settings
  addAudit(entry: AuditEntry): Promise<void>;
  listAudit(targetUserId?: string): Promise<AuditEntry[]>;
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<Settings>;
}

export interface StoredFileMeta extends FileRef {
  /**
   * The student a private file belongs to (an upload or a feedback
   * attachment). Null means course material, readable by every student.
   */
  belongsTo: string | null;
  uploadedBy: string;
  createdAt: string;
}

/** Binary storage for uploads (Supabase Storage in production, Postgres in development). */
export interface FileStorage {
  save(
    data: Buffer,
    meta: { name: string; mime: string; belongsTo: string | null; uploadedBy: string },
  ): Promise<FileRef>;
  read(id: string): Promise<{ data: Buffer; meta: StoredFileMeta } | null>;
}
