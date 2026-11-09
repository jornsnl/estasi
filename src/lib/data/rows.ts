// Conversion between the domain model (camelCase, ISO dates) and the tables in
// schema public (snake_case). Pure functions, so they are covered by unit tests.
// Used by the Postgres stores (pg-store.ts, security/pg-store.ts) and the seed
// and setup scripts.

/** Columns per table, as domain field names. Fields not listed are never written. */
const COLUMNS = {
  users: ["id", "email", "name", "role", "createdAt", "lastActiveAt", "activatedAt"],
  profiles: ["userId", "phone", "city", "companyName", "photoFileId", "instagram", "website", "intro", "goals", "updatedAt"],
  enrollments: [
    "id",
    "userId",
    "package",
    "purchasedAt",
    "endsAt",
    "pausedAt",
    "pauses",
    "revokedAt",
    "onlineCompletedAt",
    "certificateReleasedAt",
    "certificateCode",
    "practicalStatus",
    "practicalCertificateReleasedAt",
    "practicalCertificateCode",
    "ownerNotes",
  ],
  modules: ["id", "title", "description", "position", "status", "packages", "imageFileId"],
  lessons: ["id", "moduleId", "title", "summary", "position", "blocks", "status", "draft", "publishedAt"],
  answers: ["id", "userId", "lessonId", "blockId", "text", "choice", "files", "version", "createdAt", "updatedAt"],
  feedback: ["id", "answerId", "userId", "authorId", "text", "attachment", "answerVersion", "createdAt"],
  lesson_completions: ["userId", "lessonId", "completedAt"],
  assignment_submissions: [
    "id",
    "userId",
    "lessonId",
    "blockId",
    "status",
    "draft",
    "draftVersion",
    "feedbackRequested",
    "questionForSabine",
    "submittedAt",
    "createdAt",
    "updatedAt",
  ],
  submission_versions: [
    "id",
    "submissionId",
    "userId",
    "version",
    "answers",
    "assignment",
    "feedbackRequested",
    "questionForSabine",
    "feedbackStatus",
    "submittedAt",
  ],
  assignment_feedback: ["id", "versionId", "submissionId", "userId", "authorId", "text", "attachment", "sentAt", "assessment", "seenAt", "createdAt", "updatedAt"],
  module_unlocks: ["userId", "moduleId", "unlockedBy", "unlockedAt"],
  files: ["id", "name", "mime", "size", "belongsTo", "uploadedBy", "createdAt"],
  audit_log: ["id", "at", "actorId", "targetUserId", "action", "details"],
  passkeys: ["id", "userId", "publicKey", "counter", "transports", "deviceType", "backedUp", "name", "createdAt", "lastUsedAt"],
  mcp_settings: ["userId", "enabled", "allowWrite", "allowRegistration", "updatedAt"],
  oauth_clients: ["id", "name", "secretHash", "redirectUris", "source", "clientUri", "createdAt"],
  oauth_codes: ["codeHash", "clientId", "userId", "redirectUri", "codeChallenge", "scope", "resource", "expiresAt"],
  oauth_grants: [
    "id",
    "clientId",
    "userId",
    "scope",
    "resource",
    "accessHash",
    "accessExpiresAt",
    "refreshHash",
    "refreshExpiresAt",
    "createdAt",
    "lastUsedAt",
    "revokedAt",
  ],
  settings: [
    "welcomeVideoUrl",
    "welcomeTitle",
    "welcomeText",
    "headerImageFileId",
    "contactEmail",
    "practicalSpotsAvailable",
    "practicalSpotsNote",
    "answersPrivacyNotice",
    "privacyText",
  ],
} as const;

export type Table = keyof typeof COLUMNS;

const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Postgres answers "2026-01-02 10:00:00+00" (or a Date via pg); the app compares ISO strings with Z. */
const isDateField = (key: string) => key === "at" || key.endsWith("At");

function normaliseDate(value: unknown): unknown {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value !== "string") return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

/** Domain object (or patch) to a table row. With partial, only the keys present are written. */
export function toRow(table: Table, value: object, partial = false): Record<string, unknown> {
  const source = value as Record<string, unknown>;
  const row: Record<string, unknown> = {};
  for (const key of COLUMNS[table]) {
    if (partial && !(key in source)) continue;
    const field = source[key];
    row[toSnake(key)] = field === undefined ? null : field;
  }
  return row;
}

/** bigint columns: pg hands them over as strings, the app wants numbers. */
const BIGINT_FIELDS = new Set(["counter"]);

/** Table row to domain object. */
export function fromRow<T>(table: Table, row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const key of COLUMNS[table]) {
    const value = row[toSnake(key)] ?? null;
    if (isDateField(key)) out[key] = normaliseDate(value);
    else if (BIGINT_FIELDS.has(key) && typeof value === "string") out[key] = Number(value);
    else out[key] = value;
  }
  return out as T;
}

/** Columns per table (snake_case), in the order toRow writes them. */
export const columnsOf = (table: Table): string[] => COLUMNS[table].map(toSnake);

/** jsonb columns. pg would send a JS array as a Postgres array, so these go as JSON text. */
const JSON_COLUMNS: Partial<Record<Table, string[]>> = {
  enrollments: ["pauses"],
  lessons: ["blocks", "draft"],
  answers: ["files"],
  feedback: ["attachment"],
  assignment_submissions: ["draft"],
  submission_versions: ["answers", "assignment"],
  assignment_feedback: ["attachment"],
};

/**
 * A row from toRow as query parameters: jsonb values as JSON text (SQL null
 * stays null), everything else as it is (text[] columns take JS arrays).
 */
export function toParams(table: Table, row: Record<string, unknown>): unknown[] {
  const json = JSON_COLUMNS[table] ?? [];
  return Object.entries(row).map(([column, value]) =>
    json.includes(column) && value !== null && value !== undefined ? JSON.stringify(value) : value,
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids in the database are uuids; anything else (an old link, a typo) simply does not exist. */
export const isUuid = (value: string) => UUID.test(value);
