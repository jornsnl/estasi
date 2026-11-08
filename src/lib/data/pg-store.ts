import "server-only";
import { pool, type Queryable } from "@/lib/db";
import type { DataStore } from "./store";
import type {
  Answer,
  AuditEntry,
  Enrollment,
  Feedback,
  Lesson,
  LessonCompletion,
  Module,
  Profile,
  Settings,
  User,
} from "./types";
import { fromRow, isUuid, toParams, toRow, type Table } from "./rows";

/**
 * The Academy's data in Postgres (schema public), straight through `pg` with
 * the shared pool from src/lib/db.ts. Production: the Supabase database;
 * development: a local Postgres. The server actions check the role before
 * they get here; row level security keeps the tables closed to the public
 * Supabase API.
 */

const quote = (column: string) => `"${column}"`;

/** Small helpers on top of rows.ts; every table name is fixed in this file. */
export class Sql {
  constructor(private readonly db: () => Queryable = pool) {}

  async many<T>(table: Table, where = "", params: unknown[] = [], order = ""): Promise<T[]> {
    const { rows } = await this.db().query(
      `select * from public.${table}${where ? ` where ${where}` : ""}${order ? ` order by ${order}` : ""}`,
      params,
    );
    return rows.map((r: Record<string, unknown>) => fromRow<T>(table, r));
  }

  async first<T>(table: Table, where: string, params: unknown[]): Promise<T | null> {
    const { rows } = await this.db().query(`select * from public.${table} where ${where} limit 1`, params);
    return rows[0] ? fromRow<T>(table, rows[0]) : null;
  }

  async insert<T>(table: Table, value: object): Promise<T> {
    const row = toRow(table, value);
    const columns = Object.keys(row);
    const { rows } = await this.db().query(
      `insert into public.${table} (${columns.map(quote).join(", ")}) values (${columns.map((_, i) => `$${i + 1}`).join(", ")}) returning *`,
      toParams(table, row),
    );
    return fromRow<T>(table, rows[0]);
  }

  /** Insert, or overwrite every column when the key already exists. */
  async upsert<T>(table: Table, value: object, key: string[], extra: Record<string, unknown> = {}): Promise<T> {
    const row = { ...extra, ...toRow(table, value) };
    const columns = Object.keys(row);
    const updates = columns.filter((c) => !key.includes(c));
    const { rows } = await this.db().query(
      `insert into public.${table} (${columns.map(quote).join(", ")}) values (${columns.map((_, i) => `$${i + 1}`).join(", ")})
       on conflict (${key.map(quote).join(", ")}) do ${
         updates.length ? `update set ${updates.map((c) => `${quote(c)} = excluded.${quote(c)}`).join(", ")}` : "nothing"
       } returning *`,
      toParams(table, row),
    );
    if (!rows[0]) throw new Error(`Opslaan mislukt (${table})`);
    return fromRow<T>(table, rows[0]);
  }

  /** Changes only the fields present in patch; null when no row matches. */
  async update<T>(table: Table, patch: object, where: string, params: unknown[]): Promise<T | null> {
    const row = toRow(table, patch, true);
    const columns = Object.keys(row);
    if (columns.length === 0) return this.first<T>(table, where, params);
    const offset = params.length;
    const { rows } = await this.db().query(
      `update public.${table} set ${columns.map((c, i) => `${quote(c)} = $${offset + i + 1}`).join(", ")} where ${where} returning *`,
      [...params, ...toParams(table, row)],
    );
    return rows[0] ? fromRow<T>(table, rows[0]) : null;
  }

  async exec(sql: string, params: unknown[] = []) {
    return this.db().query(sql, params);
  }
}

function found<T>(value: T | null, table: Table): T {
  if (!value) throw new Error(`Niet gevonden (${table})`);
  return value;
}

export class PgDataStore implements DataStore {
  constructor(private readonly sql = new Sql()) {}

  // Users ------------------------------------------------------------------

  async getUser(id: string) {
    if (!isUuid(id)) return null;
    return this.sql.first<User>("users", "id = $1", [id]);
  }
  async getUserByEmail(email: string) {
    const needle = email.trim().toLowerCase();
    if (!needle) return null;
    return this.sql.first<User>("users", "email = $1", [needle]);
  }
  async listUsers(role?: User["role"]) {
    return role ? this.sql.many<User>("users", "role = $1", [role], "created_at") : this.sql.many<User>("users", "", [], "created_at");
  }
  async createUser(user: User) {
    return this.sql.insert<User>("users", { ...user, email: user.email.trim().toLowerCase() });
  }
  async updateUser(id: string, patch: Partial<User>) {
    if (!isUuid(id)) throw new Error("Niet gevonden (users)");
    return found(await this.sql.update<User>("users", patch, "id = $1", [id]), "users");
  }

  // Profiles ---------------------------------------------------------------

  async getProfile(userId: string) {
    if (!isUuid(userId)) return null;
    return this.sql.first<Profile>("profiles", "user_id = $1", [userId]);
  }
  async saveProfile(profile: Profile) {
    return this.sql.upsert<Profile>("profiles", profile, ["user_id"]);
  }

  // Enrollments ------------------------------------------------------------

  async getEnrollmentForUser(userId: string) {
    if (!isUuid(userId)) return null;
    return this.sql.first<Enrollment>("enrollments", "user_id = $1", [userId]);
  }
  async listEnrollments() {
    return this.sql.many<Enrollment>("enrollments", "", [], "purchased_at");
  }
  async createEnrollment(enrollment: Enrollment) {
    return this.sql.insert<Enrollment>("enrollments", enrollment);
  }
  async updateEnrollment(id: string, patch: Partial<Enrollment>) {
    if (!isUuid(id)) throw new Error("Niet gevonden (enrollments)");
    return found(await this.sql.update<Enrollment>("enrollments", patch, "id = $1", [id]), "enrollments");
  }

  // Content ----------------------------------------------------------------

  async listModules() {
    return this.sql.many<Module>("modules", "", [], "position");
  }
  async getModule(id: string) {
    if (!isUuid(id)) return null;
    return this.sql.first<Module>("modules", "id = $1", [id]);
  }
  async saveModule(module: Module) {
    return this.sql.upsert<Module>("modules", module, ["id"]);
  }
  async deleteModule(id: string) {
    // Lessons go with it (on delete cascade); answers stay.
    if (isUuid(id)) await this.sql.exec("delete from public.modules where id = $1", [id]);
  }
  async listLessons(moduleId?: string) {
    if (moduleId === undefined) return this.sql.many<Lesson>("lessons", "", [], "position");
    if (!isUuid(moduleId)) return [];
    return this.sql.many<Lesson>("lessons", "module_id = $1", [moduleId], "position");
  }
  async getLesson(id: string) {
    if (!isUuid(id)) return null;
    return this.sql.first<Lesson>("lessons", "id = $1", [id]);
  }
  async saveLesson(lesson: Lesson) {
    return this.sql.upsert<Lesson>("lessons", lesson, ["id"]);
  }
  async deleteLesson(id: string) {
    if (isUuid(id)) await this.sql.exec("delete from public.lessons where id = $1", [id]);
  }

  // Answers, feedback and progress -------------------------------------------

  async listAnswers(filter: { userId?: string; lessonId?: string }) {
    if ((filter.userId && !isUuid(filter.userId)) || (filter.lessonId && !isUuid(filter.lessonId))) return [];
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.userId) where.push(`user_id = $${params.push(filter.userId)}`);
    if (filter.lessonId) where.push(`lesson_id = $${params.push(filter.lessonId)}`);
    return this.sql.many<Answer>("answers", where.join(" and "), params, "created_at");
  }
  async getAnswer(id: string) {
    if (!isUuid(id)) return null;
    return this.sql.first<Answer>("answers", "id = $1", [id]);
  }
  async saveAnswer(answer: Answer) {
    return this.sql.upsert<Answer>("answers", answer, ["id"]);
  }
  async listFeedback(filter: { userId?: string; answerId?: string }) {
    if ((filter.userId && !isUuid(filter.userId)) || (filter.answerId && !isUuid(filter.answerId))) return [];
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.userId) where.push(`user_id = $${params.push(filter.userId)}`);
    if (filter.answerId) where.push(`answer_id = $${params.push(filter.answerId)}`);
    return this.sql.many<Feedback>("feedback", where.join(" and "), params, "created_at");
  }
  async createFeedback(feedback: Feedback) {
    return this.sql.insert<Feedback>("feedback", feedback);
  }
  async listCompletions(userId?: string) {
    if (userId === undefined) return this.sql.many<LessonCompletion>("lesson_completions", "", [], "completed_at");
    if (!isUuid(userId)) return [];
    return this.sql.many<LessonCompletion>("lesson_completions", "user_id = $1", [userId], "completed_at");
  }
  async setCompletion(completion: LessonCompletion) {
    await this.sql.upsert("lesson_completions", completion, ["user_id", "lesson_id"]);
  }

  // Audit log and settings ---------------------------------------------------

  async addAudit(entry: AuditEntry) {
    await this.sql.insert("audit_log", entry);
  }
  async listAudit(targetUserId?: string) {
    if (targetUserId === undefined) return this.sql.many<AuditEntry>("audit_log", "", [], "at desc");
    if (!isUuid(targetUserId)) return [];
    return this.sql.many<AuditEntry>("audit_log", "target_user_id = $1", [targetUserId], "at desc");
  }
  async getSettings() {
    const settings = await this.sql.first<Settings>("settings", "id = true", []);
    if (!settings) throw new Error("De tabel settings is leeg. Voer de migraties uit (zie README).");
    return settings;
  }
  async saveSettings(settings: Settings) {
    return this.sql.upsert<Settings>("settings", settings, ["id"], { id: true });
  }
}
