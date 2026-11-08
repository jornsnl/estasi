import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { createSeed } from "@/lib/data/seed";
import { columnsOf, fromRow, isUuid, toParams, toRow, type Table } from "@/lib/data/rows";
import type { Answer, Enrollment, Lesson, Settings, User } from "@/lib/data/types";
import type { Passkey } from "@/lib/security/types";

const seed = createSeed();

describe("database rows", () => {
  it("writes snake_case columns and no password fields", () => {
    const row = toRow("users", seed.users[0]);
    expect(row).toMatchObject({ email: "sabine@estasiweddings.nl", role: "owner" });
    expect(row).toHaveProperty("last_active_at");
    expect(row).toHaveProperty("activated_at");
    expect(row).not.toHaveProperty("password_hash");
    expect(row).not.toHaveProperty("setup_token");
  });

  it("round trips every seeded entity", () => {
    const cases = [
      ["profiles", seed.profiles],
      ["enrollments", seed.enrollments],
      ["modules", seed.modules],
      ["lessons", seed.lessons],
      ["answers", seed.answers],
      ["lesson_completions", seed.completions],
    ] as const;
    for (const [table, items] of cases) {
      for (const item of items) expect(fromRow(table, toRow(table, item))).toEqual(item);
    }
  });

  it("reads users back as they were", () => {
    const user = fromRow<User>("users", toRow("users", seed.users[1]));
    expect(user).toEqual(seed.users[1]);
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("turns the Date objects of pg into ISO strings", () => {
    const user = fromRow<User>("users", {
      ...toRow("users", seed.users[1]),
      created_at: new Date("2026-01-02T10:00:00Z"),
      last_active_at: null,
    });
    expect(user.createdAt).toBe("2026-01-02T10:00:00.000Z");
    expect(user.lastActiveAt).toBeNull();
  });

  it("reads bigint counters (strings from pg) as numbers", () => {
    const passkey: Passkey = {
      id: "cred",
      userId: "u",
      publicKey: "pk",
      counter: 7,
      transports: ["internal"],
      deviceType: "multiDevice",
      backedUp: true,
      name: "iPhone",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastUsedAt: null,
    };
    expect(fromRow<Passkey>("passkeys", { ...toRow("passkeys", passkey), counter: "7" })).toEqual(passkey);
  });

  it("sends jsonb columns as JSON text and text[] columns as arrays", () => {
    const lesson = seed.lessons[0];
    const lessonParams = toParams("lessons", toRow("lessons", lesson));
    expect(lessonParams[columnsOf("lessons").indexOf("blocks")]).toBe(JSON.stringify(lesson.blocks));
    const enrollmentParams = toParams("enrollments", toRow("enrollments", seed.enrollments[0]));
    expect(enrollmentParams[columnsOf("enrollments").indexOf("pauses")]).toBe("[]");
    const feedbackParams = toParams("feedback", toRow("feedback", { attachment: null, text: "x" }, true));
    expect(feedbackParams).toEqual(["x", null]);
    const passkeyParams = toParams("passkeys", toRow("passkeys", { transports: ["usb"] }, true));
    expect(passkeyParams).toEqual([["usb"]]);
  });

  it("only writes the fields of a patch", () => {
    expect(toRow("enrollments", { revokedAt: null, ownerNotes: "x" }, true)).toEqual({ revoked_at: null, owner_notes: "x" });
    expect(toRow("users", { lastActiveAt: "2026-01-01T00:00:00.000Z" }, true)).toEqual({ last_active_at: "2026-01-01T00:00:00.000Z" });
  });

  it("normalises Postgres timestamps to ISO strings", () => {
    const e = fromRow<Enrollment>("enrollments", {
      ...toRow("enrollments", seed.enrollments[0]),
      ends_at: "2027-03-01 12:00:00+00",
      paused_at: null,
    });
    expect(e.endsAt).toBe("2027-03-01T12:00:00.000Z");
    expect(e.pausedAt).toBeNull();
  });

  it("recognises uuids", () => {
    expect(isUuid("3f2b8c4e-1d2a-4b6c-9e8f-0a1b2c3d4e5f")).toBe(true);
    expect(isUuid("les-1-1")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});

// Every domain field must have a column, and every column must exist in the
// migrations; otherwise the database silently drops (or rejects) a field.

const sql = ["0001_init.sql", "0002_supabase_auth.sql"]
  .map((f) => readFileSync(path.join(__dirname, "..", "supabase", "migrations", f), "utf8"))
  .join("\n");

function migrationColumns(table: string): Set<string> {
  const columns = new Set<string>();
  const create = new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql);
  if (!create) throw new Error(`Tabel ${table} niet gevonden in de migraties`);
  for (const raw of create[1].split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--") || /^(unique|primary key|check|constraint)\b/.test(line)) continue;
    columns.add(line.split(/\s+/)[0]);
  }
  for (const m of sql.matchAll(new RegExp(`alter table public\\.${table} add column if not exists (\\w+)`, "g"))) columns.add(m[1]);
  return columns;
}

const SAMPLES: [Table, object][] = [
  ["users", seed.users[1]],
  ["profiles", seed.profiles[0]],
  ["enrollments", seed.enrollments[0]],
  ["modules", seed.modules[0]],
  ["lessons", seed.lessons[0]],
  ["answers", seed.answers[0]],
  ["feedback", { id: "f", answerId: "a", userId: "u", authorId: "o", text: "t", attachment: null, answerVersion: 1, createdAt: "2026-01-01T00:00:00.000Z" }],
  ["lesson_completions", seed.completions[0]],
  ["audit_log", { id: "x", at: "2026-01-01T00:00:00.000Z", actorId: "o", targetUserId: null, action: "a", details: "" }],
  ["settings", seed.settings],
  ["files", { id: "f", name: "n.pdf", size: 1, mime: "application/pdf", belongsTo: null, uploadedBy: "o", createdAt: "2026-01-01T00:00:00.000Z" }],
];

describe("database rows match the domain and the schema", () => {
  it.each(SAMPLES)("%s: every domain field has a column", (table, sample) => {
    const back = fromRow<Record<string, unknown>>(table, toRow(table, sample));
    for (const key of Object.keys(sample)) {
      expect(back, `${table}.${key} gaat verloren in de database`).toHaveProperty(key);
      expect(back[key]).toEqual((sample as Record<string, unknown>)[key]);
    }
  });

  it.each(SAMPLES)("%s: every written column exists in the migrations", (table, sample) => {
    const columns = migrationColumns(table);
    for (const column of Object.keys(toRow(table, sample))) {
      expect(columns.has(column), `kolom ${table}.${column} ontbreekt in de migraties`).toBe(true);
    }
  });

  it("keeps empty strings, false and null as they are", () => {
    const settings: Settings = { ...seed.settings, welcomeText: "", practicalSpotsAvailable: false };
    expect(fromRow<Settings>("settings", toRow("settings", settings))).toEqual(settings);
    const answer: Answer = { ...seed.answers[0], text: "", choice: null, files: [] };
    expect(fromRow<Answer>("answers", toRow("answers", answer))).toEqual(answer);
  });

  it("round trips every block type with all its fields", () => {
    const lesson: Lesson = {
      id: "l",
      moduleId: "m",
      title: "Les",
      summary: "",
      position: 3,
      blocks: [
        { id: "1", type: "video", url: "https://vimeo.com/1", caption: "c" },
        { id: "2", type: "text", markdown: "## Kop\n\n- a\n- **b**" },
        { id: "3", type: "download", label: "l", description: "d", url: "", file: { id: "f", name: "x.pdf", size: 3, mime: "application/pdf" } },
        { id: "4", type: "question", kind: "reflection", prompt: "p", helpText: "", required: false, feedback: true },
        { id: "5", type: "choice", prompt: "p", helpText: "h", options: ["a", "b"], required: true, feedback: false },
        { id: "6", type: "upload", prompt: "p", helpText: "", required: false, feedback: true },
      ],
    };
    // Postgres hands jsonb back as a fresh object.
    const row = JSON.parse(JSON.stringify(toRow("lessons", lesson)));
    expect(fromRow<Lesson>("lessons", row)).toEqual(lesson);
  });

  it("keeps pauses and certificate data of an enrollment", () => {
    const enrollment: Enrollment = {
      ...seed.enrollments[0],
      pausedAt: "2026-03-01T10:00:00.000Z",
      pauses: [{ pausedAt: "2026-03-01T10:00:00.000Z", resumedAt: null }],
      onlineCompletedAt: "2026-02-01T10:00:00.000Z",
      certificateReleasedAt: "2026-02-02T10:00:00.000Z",
      certificateCode: "WPA-2026-ABC123",
      practicalStatus: "planned",
      ownerNotes: "Factuur 12",
    };
    const row = { ...JSON.parse(JSON.stringify(toRow("enrollments", enrollment))), paused_at: "2026-03-01 10:00:00+00" };
    expect(fromRow<Enrollment>("enrollments", row)).toEqual(enrollment);
  });

  it("a patch never overwrites fields it does not mention", () => {
    expect(Object.keys(toRow("enrollments", { endsAt: "2027-01-01T00:00:00.000Z" }, true))).toEqual(["ends_at"]);
    expect(Object.keys(toRow("users", { name: "Nieuw" }, true))).toEqual(["name"]);
  });
});
