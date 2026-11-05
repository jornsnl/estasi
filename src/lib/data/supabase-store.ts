import "server-only";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/supabase/config";
import type { DataStore, FileStorage, StoredFileMeta } from "./store";
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
import { fromRow, isUuid, toRow, type Table } from "./supabase-rows";

/**
 * Supabase implementation of DataStore. Runs on the server with the secret
 * key: the server actions check the role before they get here, and row level
 * security keeps the tables closed to anyone holding only the public key.
 */

const PAGE = 1000;

type Query = PromiseLike<{ data: unknown; error: { message: string } | null }>;

function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Supabase (${what}): ${result.error.message}`);
  return result.data;
}

export class SupabaseDataStore implements DataStore {
  constructor(private readonly client: () => SupabaseClient = adminClient) {}

  private from(table: Table) {
    return this.client().from(table);
  }

  /** PostgREST returns at most 1000 rows per request, so page through. */
  private async all<T>(table: Table, build: (from: number, to: number) => Query): Promise<T[]> {
    const rows: Record<string, unknown>[] = [];
    for (let start = 0; ; start += PAGE) {
      const page = check(await build(start, start + PAGE - 1), table) as Record<string, unknown>[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    return rows.map((r) => fromRow<T>(table, r));
  }

  private async one<T>(table: Table, query: Query): Promise<T | null> {
    const row = check(await query, table) as Record<string, unknown> | null;
    return row ? fromRow<T>(table, row) : null;
  }

  private async write<T>(table: Table, query: Query): Promise<T> {
    const row = check(await query, table) as Record<string, unknown> | null;
    if (!row) throw new Error(`Niet gevonden (${table})`);
    return fromRow<T>(table, row);
  }

  // Users ------------------------------------------------------------------

  async getUser(id: string) {
    if (!isUuid(id)) return null;
    return this.one<User>("users", this.from("users").select().eq("id", id).maybeSingle());
  }
  async getUserByEmail(email: string) {
    const needle = email.trim().toLowerCase();
    if (!needle) return null;
    return this.one<User>("users", this.from("users").select().eq("email", needle).maybeSingle());
  }
  async getUserBySetupToken() {
    // Activation and reset links are handled by Supabase Auth.
    return null;
  }
  async listUsers(role?: User["role"]) {
    return this.all<User>("users", (a, b) => {
      const q = this.from("users").select().order("created_at");
      return (role ? q.eq("role", role) : q).range(a, b);
    });
  }
  async createUser(user: User) {
    const row = toRow("users", { ...user, email: user.email.trim().toLowerCase() });
    return this.write<User>("users", this.from("users").insert(row).select().single());
  }
  async updateUser(id: string, patch: Partial<User>) {
    return this.write<User>("users", this.from("users").update(toRow("users", patch, true)).eq("id", id).select().maybeSingle());
  }

  // Profiles ---------------------------------------------------------------

  async getProfile(userId: string) {
    if (!isUuid(userId)) return null;
    return this.one<Profile>("profiles", this.from("profiles").select().eq("user_id", userId).maybeSingle());
  }
  async saveProfile(profile: Profile) {
    return this.write<Profile>(
      "profiles",
      this.from("profiles").upsert(toRow("profiles", profile), { onConflict: "user_id" }).select().single(),
    );
  }

  // Enrollments ------------------------------------------------------------

  async getEnrollmentForUser(userId: string) {
    if (!isUuid(userId)) return null;
    return this.one<Enrollment>("enrollments", this.from("enrollments").select().eq("user_id", userId).maybeSingle());
  }
  async listEnrollments() {
    return this.all<Enrollment>("enrollments", (a, b) => this.from("enrollments").select().order("purchased_at").range(a, b));
  }
  async createEnrollment(enrollment: Enrollment) {
    return this.write<Enrollment>("enrollments", this.from("enrollments").insert(toRow("enrollments", enrollment)).select().single());
  }
  async updateEnrollment(id: string, patch: Partial<Enrollment>) {
    return this.write<Enrollment>(
      "enrollments",
      this.from("enrollments").update(toRow("enrollments", patch, true)).eq("id", id).select().maybeSingle(),
    );
  }

  // Content ----------------------------------------------------------------

  async listModules() {
    return this.all<Module>("modules", (a, b) => this.from("modules").select().order("position").range(a, b));
  }
  async getModule(id: string) {
    if (!isUuid(id)) return null;
    return this.one<Module>("modules", this.from("modules").select().eq("id", id).maybeSingle());
  }
  async saveModule(module: Module) {
    return this.write<Module>("modules", this.from("modules").upsert(toRow("modules", module)).select().single());
  }
  async deleteModule(id: string) {
    // Lessons go with it (on delete cascade); answers stay.
    if (isUuid(id)) check(await this.from("modules").delete().eq("id", id), "modules");
  }
  async listLessons(moduleId?: string) {
    if (moduleId !== undefined && !isUuid(moduleId)) return [];
    return this.all<Lesson>("lessons", (a, b) => {
      const q = this.from("lessons").select().order("position");
      return (moduleId ? q.eq("module_id", moduleId) : q).range(a, b);
    });
  }
  async getLesson(id: string) {
    if (!isUuid(id)) return null;
    return this.one<Lesson>("lessons", this.from("lessons").select().eq("id", id).maybeSingle());
  }
  async saveLesson(lesson: Lesson) {
    return this.write<Lesson>("lessons", this.from("lessons").upsert(toRow("lessons", lesson)).select().single());
  }
  async deleteLesson(id: string) {
    if (isUuid(id)) check(await this.from("lessons").delete().eq("id", id), "lessons");
  }

  // Answers, feedback and progress -------------------------------------------

  async listAnswers(filter: { userId?: string; lessonId?: string }) {
    if ((filter.userId && !isUuid(filter.userId)) || (filter.lessonId && !isUuid(filter.lessonId))) return [];
    return this.all<Answer>("answers", (a, b) => {
      let q = this.from("answers").select().order("created_at");
      if (filter.userId) q = q.eq("user_id", filter.userId);
      if (filter.lessonId) q = q.eq("lesson_id", filter.lessonId);
      return q.range(a, b);
    });
  }
  async getAnswer(id: string) {
    if (!isUuid(id)) return null;
    return this.one<Answer>("answers", this.from("answers").select().eq("id", id).maybeSingle());
  }
  async saveAnswer(answer: Answer) {
    return this.write<Answer>("answers", this.from("answers").upsert(toRow("answers", answer)).select().single());
  }
  async listFeedback(filter: { userId?: string; answerId?: string }) {
    if ((filter.userId && !isUuid(filter.userId)) || (filter.answerId && !isUuid(filter.answerId))) return [];
    return this.all<Feedback>("feedback", (a, b) => {
      let q = this.from("feedback").select().order("created_at");
      if (filter.userId) q = q.eq("user_id", filter.userId);
      if (filter.answerId) q = q.eq("answer_id", filter.answerId);
      return q.range(a, b);
    });
  }
  async createFeedback(feedback: Feedback) {
    return this.write<Feedback>("feedback", this.from("feedback").insert(toRow("feedback", feedback)).select().single());
  }
  async listCompletions(userId?: string) {
    if (userId !== undefined && !isUuid(userId)) return [];
    return this.all<LessonCompletion>("lesson_completions", (a, b) => {
      const q = this.from("lesson_completions").select().order("completed_at");
      return (userId ? q.eq("user_id", userId) : q).range(a, b);
    });
  }
  async setCompletion(completion: LessonCompletion) {
    check(
      await this.from("lesson_completions").upsert(toRow("lesson_completions", completion), { onConflict: "user_id,lesson_id" }),
      "lesson_completions",
    );
  }

  // Audit log and settings ---------------------------------------------------

  async addAudit(entry: AuditEntry) {
    check(await this.from("audit_log").insert(toRow("audit_log", entry)), "audit_log");
  }
  async listAudit(targetUserId?: string) {
    if (targetUserId !== undefined && !isUuid(targetUserId)) return [];
    return this.all<AuditEntry>("audit_log", (a, b) => {
      const q = this.from("audit_log").select().order("at", { ascending: false });
      return (targetUserId ? q.eq("target_user_id", targetUserId) : q).range(a, b);
    });
  }
  async getSettings() {
    const settings = await this.one<Settings>("settings", this.from("settings").select().eq("id", true).maybeSingle());
    if (!settings) throw new Error("De tabel settings is leeg. Voer de migraties uit (zie README).");
    return settings;
  }
  async saveSettings(settings: Settings) {
    return this.write<Settings>(
      "settings",
      this.from("settings").upsert({ id: true, ...toRow("settings", settings) }).select().single(),
    );
  }
}

/** Uploads in the private Storage bucket, metadata in the files table. */
export class SupabaseFileStorage implements FileStorage {
  constructor(private readonly client: () => SupabaseClient = adminClient) {}

  async save(
    data: Buffer,
    meta: { name: string; mime: string; belongsTo: string | null; uploadedBy: string },
  ): Promise<FileRef> {
    const file: StoredFileMeta = {
      id: randomUUID(),
      name: meta.name,
      mime: meta.mime || "application/octet-stream",
      size: data.length,
      belongsTo: meta.belongsTo,
      uploadedBy: meta.uploadedBy,
      createdAt: new Date().toISOString(),
    };
    const db = this.client();
    check(await db.storage.from(BUCKET).upload(file.id, data, { contentType: file.mime, upsert: false }), "storage");
    const inserted = await db.from("files").insert(toRow("files", file));
    if (inserted.error) {
      await db.storage.from(BUCKET).remove([file.id]);
      check(inserted, "files");
    }
    return { id: file.id, name: file.name, mime: file.mime, size: file.size };
  }

  async read(id: string) {
    if (!isUuid(id)) return null;
    const db = this.client();
    const row = check(await db.from("files").select().eq("id", id).maybeSingle(), "files") as Record<string, unknown> | null;
    if (!row) return null;
    const { data, error } = await db.storage.from(BUCKET).download(id);
    if (error || !data) return null;
    return { data: Buffer.from(await data.arrayBuffer()), meta: fromRow<StoredFileMeta>("files", row) };
  }
}
