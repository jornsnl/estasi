// Conversion between the domain model (camelCase, ISO dates) and the Supabase
// tables (snake_case). Pure functions, so they are covered by unit tests.

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
    "ownerNotes",
  ],
  modules: ["id", "title", "description", "position"],
  lessons: ["id", "moduleId", "title", "summary", "position", "blocks"],
  answers: ["id", "userId", "lessonId", "blockId", "text", "choice", "files", "version", "createdAt", "updatedAt"],
  feedback: ["id", "answerId", "userId", "authorId", "text", "attachment", "answerVersion", "createdAt"],
  lesson_completions: ["userId", "lessonId", "completedAt"],
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
    "welcomeText",
    "contactEmail",
    "practicalSpotsAvailable",
    "practicalSpotsNote",
    "answersPrivacyNotice",
  ],
} as const;

export type Table = keyof typeof COLUMNS;

const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Postgres answers "2026-01-02 10:00:00+00"; the app compares ISO strings with Z. */
const isDateField = (key: string) => key === "at" || key.endsWith("At");

function normaliseDate(value: unknown): unknown {
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

/** Table row to domain object. */
export function fromRow<T>(table: Table, row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const key of COLUMNS[table]) {
    const value = row[toSnake(key)];
    out[key] = isDateField(key) ? normaliseDate(value ?? null) : (value ?? null);
  }
  if (table === "users") {
    // Passwords and reset tokens live in Supabase Auth, not in this table.
    Object.assign(out, { passwordHash: null, setupToken: null, setupTokenExpiresAt: null });
  }
  return out as T;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids in the database are uuids; anything else (an old link, a typo) simply does not exist. */
export const isUuid = (value: string) => UUID.test(value);
