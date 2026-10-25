import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
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
import { createSeed } from "./seed";

/**
 * Local development storage: one JSON file in DATA_DIR (default ./.data).
 * No database needed, and everything survives a restart. Not meant for
 * production: Render/Railway disks are ephemeral unless you mount a volume.
 */

export interface LocalDb {
  users: User[];
  profiles: Profile[];
  enrollments: Enrollment[];
  modules: Module[];
  lessons: Lesson[];
  answers: Answer[];
  feedback: Feedback[];
  completions: LessonCompletion[];
  audit: AuditEntry[];
  files: StoredFileMeta[];
  settings: Settings;
}

const dataDir = () => path.resolve(process.env.DATA_DIR ?? ".data");
const dbPath = () => path.join(dataDir(), "db.json");
const uploadsDir = () => path.join(dataDir(), "uploads");

// Cache on globalThis so Next.js hot reloads share one copy and one write queue.
const state = globalThis as unknown as {
  __academyDb?: Promise<LocalDb>;
  __academyWrite?: Promise<void>;
};

async function load(): Promise<LocalDb> {
  try {
    const raw = await fs.readFile(dbPath(), "utf8");
    return JSON.parse(raw) as LocalDb;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    const seed = createSeed();
    await persist(seed);
    return seed;
  }
}

async function persist(db: LocalDb) {
  await fs.mkdir(dataDir(), { recursive: true });
  const tmp = `${dbPath()}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, dbPath());
}

function db(): Promise<LocalDb> {
  state.__academyDb ??= load();
  return state.__academyDb;
}

/** Runs a mutation and writes the file; writes are serialised. */
async function mutate<T>(fn: (db: LocalDb) => T): Promise<T> {
  const data = await db();
  const result = fn(data);
  const previous = state.__academyWrite ?? Promise.resolve();
  const next = previous.then(() => persist(data));
  state.__academyWrite = next.catch(() => undefined);
  await next;
  return result;
}

const clone = <T>(value: T): T => structuredClone(value);

function upsert<T>(list: T[], item: T, match: (x: T) => boolean) {
  const index = list.findIndex(match);
  if (index === -1) list.push(item);
  else list[index] = item;
}

function patchById<T extends { id: string }>(list: T[], id: string, patch: Partial<T>): T {
  const item = list.find((x) => x.id === id);
  if (!item) throw new Error(`Niet gevonden: ${id}`);
  Object.assign(item, patch, { id });
  return clone(item);
}

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

export class LocalDataStore implements DataStore {
  async getUser(id: string) {
    return clone((await db()).users.find((u) => u.id === id) ?? null);
  }
  async getUserByEmail(email: string) {
    const needle = email.trim().toLowerCase();
    return clone((await db()).users.find((u) => u.email.toLowerCase() === needle) ?? null);
  }
  async getUserBySetupToken(token: string) {
    return clone((await db()).users.find((u) => u.setupToken === token) ?? null);
  }
  async listUsers(role?: User["role"]) {
    return clone((await db()).users.filter((u) => !role || u.role === role));
  }
  async createUser(user: User) {
    return mutate((d) => {
      d.users.push(clone(user));
      return clone(user);
    });
  }
  async updateUser(id: string, patch: Partial<User>) {
    return mutate((d) => patchById(d.users, id, patch));
  }

  async getProfile(userId: string) {
    return clone((await db()).profiles.find((p) => p.userId === userId) ?? null);
  }
  async saveProfile(profile: Profile) {
    return mutate((d) => {
      upsert(d.profiles, clone(profile), (p) => p.userId === profile.userId);
      return clone(profile);
    });
  }

  async getEnrollmentForUser(userId: string) {
    return clone((await db()).enrollments.find((e) => e.userId === userId) ?? null);
  }
  async listEnrollments() {
    return clone((await db()).enrollments);
  }
  async createEnrollment(enrollment: Enrollment) {
    return mutate((d) => {
      d.enrollments.push(clone(enrollment));
      return clone(enrollment);
    });
  }
  async updateEnrollment(id: string, patch: Partial<Enrollment>) {
    return mutate((d) => patchById(d.enrollments, id, patch));
  }

  async listModules() {
    return clone([...(await db()).modules].sort(byPosition));
  }
  async getModule(id: string) {
    return clone((await db()).modules.find((m) => m.id === id) ?? null);
  }
  async saveModule(module: Module) {
    return mutate((d) => {
      upsert(d.modules, clone(module), (m) => m.id === module.id);
      return clone(module);
    });
  }
  async deleteModule(id: string) {
    await mutate((d) => {
      const lessonIds = new Set(d.lessons.filter((l) => l.moduleId === id).map((l) => l.id));
      d.modules = d.modules.filter((m) => m.id !== id);
      d.lessons = d.lessons.filter((l) => !lessonIds.has(l.id));
    });
  }
  async listLessons(moduleId?: string) {
    const lessons = (await db()).lessons.filter((l) => !moduleId || l.moduleId === moduleId);
    return clone([...lessons].sort(byPosition));
  }
  async getLesson(id: string) {
    return clone((await db()).lessons.find((l) => l.id === id) ?? null);
  }
  async saveLesson(lesson: Lesson) {
    return mutate((d) => {
      upsert(d.lessons, clone(lesson), (l) => l.id === lesson.id);
      return clone(lesson);
    });
  }
  async deleteLesson(id: string) {
    // Answers stay: they belong to the student and fall under the retention policy.
    await mutate((d) => {
      d.lessons = d.lessons.filter((l) => l.id !== id);
    });
  }

  async listAnswers(filter: { userId?: string; lessonId?: string }) {
    return clone(
      (await db()).answers.filter(
        (a) =>
          (!filter.userId || a.userId === filter.userId) &&
          (!filter.lessonId || a.lessonId === filter.lessonId),
      ),
    );
  }
  async getAnswer(id: string) {
    return clone((await db()).answers.find((a) => a.id === id) ?? null);
  }
  async saveAnswer(answer: Answer) {
    return mutate((d) => {
      upsert(d.answers, clone(answer), (a) => a.id === answer.id);
      return clone(answer);
    });
  }
  async listFeedback(filter: { userId?: string; answerId?: string }) {
    return clone(
      (await db()).feedback.filter(
        (f) =>
          (!filter.userId || f.userId === filter.userId) &&
          (!filter.answerId || f.answerId === filter.answerId),
      ),
    );
  }
  async createFeedback(feedback: Feedback) {
    return mutate((d) => {
      d.feedback.push(clone(feedback));
      return clone(feedback);
    });
  }
  async listCompletions(userId?: string) {
    return clone((await db()).completions.filter((c) => !userId || c.userId === userId));
  }
  async setCompletion(completion: LessonCompletion) {
    await mutate((d) => {
      upsert(
        d.completions,
        clone(completion),
        (c) => c.userId === completion.userId && c.lessonId === completion.lessonId,
      );
    });
  }

  async addAudit(entry: AuditEntry) {
    await mutate((d) => {
      d.audit.push(clone(entry));
    });
  }
  async listAudit(targetUserId?: string) {
    const entries = (await db()).audit.filter((a) => !targetUserId || a.targetUserId === targetUserId);
    return clone([...entries].reverse());
  }
  async getSettings() {
    return clone((await db()).settings);
  }
  async saveSettings(settings: Settings) {
    return mutate((d) => {
      d.settings = clone(settings);
      return clone(settings);
    });
  }
}

export class LocalFileStorage implements FileStorage {
  async save(
    data: Buffer,
    meta: { name: string; mime: string; belongsTo: string | null; uploadedBy: string },
  ): Promise<FileRef> {
    const ref: StoredFileMeta = {
      id: randomUUID(),
      name: meta.name,
      mime: meta.mime || "application/octet-stream",
      size: data.length,
      belongsTo: meta.belongsTo,
      uploadedBy: meta.uploadedBy,
      createdAt: new Date().toISOString(),
    };
    await fs.mkdir(uploadsDir(), { recursive: true });
    await fs.writeFile(path.join(uploadsDir(), ref.id), data);
    await mutate((d) => {
      d.files.push(ref);
    });
    return { id: ref.id, name: ref.name, mime: ref.mime, size: ref.size };
  }

  async read(id: string) {
    const meta = (await db()).files.find((f) => f.id === id);
    if (!meta) return null;
    try {
      const data = await fs.readFile(path.join(uploadsDir(), meta.id));
      return { data, meta: clone(meta) };
    } catch {
      return null;
    }
  }
}
