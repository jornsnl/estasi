import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AssignmentBlock, LegacyBlock, Lesson } from "@/lib/data/types";
import { legacyToAssignment } from "@/lib/domain/assignment";

/**
 * Assignments against a real, migrated database (migration 0025): the
 * conversion of old data, drafts with optimistic locking, the feedback limit
 * in a transaction, submitting with versions and lesson completion. Runs only
 * with TEST_DATABASE_URL, for example:
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/estasi_g npm test
 * Everything it makes is removed again (the migration test runs in a transaction that is rolled back).
 */
const url = process.env.TEST_DATABASE_URL;
const MIGRATION = readFileSync(path.join(__dirname, "..", "supabase", "migrations", "0025_academy_opdrachten.sql"), "utf8");

describe.skipIf(!url)("migratie 0025: vragen, antwoorden en feedback naar opdrachten", () => {
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: url });
    await client.connect();
    await client.query("begin");
  });

  afterAll(async () => {
    await client?.query("rollback");
    await client?.end();
  });

  it("de SQL-omzetting van een blok is dezelfde als legacyToAssignment", async () => {
    const start = MIGRATION.indexOf("create or replace function public.wpa_legacy_assignment");
    const end = MIGRATION.indexOf("$$;", start) + 3;
    await client.query(MIGRATION.slice(start, end).replace("public.wpa_legacy_assignment", "pg_temp.wpa_legacy_assignment"));
    const blocks: LegacyBlock[] = [
      { id: "q", type: "question", kind: "practice", prompt: "Schrijf", helpText: "Uitleg", required: true, feedback: true },
      { id: "c", type: "choice", prompt: "Kies", helpText: "", options: ["a", "b"], required: false, feedback: false },
      { id: "u", type: "upload", prompt: "Upload", helpText: "", required: false, feedback: true },
    ];
    for (const block of blocks) {
      const { rows } = await client.query("select pg_temp.wpa_legacy_assignment($1::jsonb) as a", [JSON.stringify(block)]);
      expect(rows[0].a).toEqual(legacyToAssignment(block));
    }
  });

  it("zet bestaande data om zonder iets kwijt te raken, ook als hij twee keer draait", async () => {
    const [student, owner, moduleId, lessonId, otherLesson] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const q = async (sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows;
    await q("insert into auth.users (id, email) values ($1, $2), ($3, $4)", [student, `m-${student}@x.nl`, owner, `m-${owner}@x.nl`]);
    await q("insert into public.users (id, email, name, role) values ($1, $2, 'S', 'student'), ($3, $4, 'O', 'owner')", [student, `m-${student}@x.nl`, owner, `m-${owner}@x.nl`]);
    await q("insert into public.modules (id, title, position) values ($1, 'M', 99)", [moduleId]);
    const blocks = [
      { id: "v", type: "video", url: "", caption: "" },
      { id: "q1", type: "question", kind: "open", prompt: "Vraag", helpText: "", required: true, feedback: true },
      { id: "c1", type: "choice", prompt: "Kies", helpText: "", options: ["a", "b"], required: true, feedback: false },
      { id: "u1", type: "upload", prompt: "Upload", helpText: "", required: false, feedback: true },
    ];
    await q("insert into public.lessons (id, module_id, title, position, blocks) values ($1, $2, 'L', 1, $3), ($4, $2, 'L2', 2, '[]')", [lessonId, moduleId, JSON.stringify(blocks), otherLesson]);
    const files = [{ id: randomUUID(), name: "plan.pdf", size: 3, mime: "application/pdf" }];
    const [a1] = await q("insert into public.answers (user_id, lesson_id, block_id, text, version) values ($1, $2, 'q1', 'Mijn tekst', 3) returning id", [student, lessonId]);
    const [a2] = await q("insert into public.answers (user_id, lesson_id, block_id, choice) values ($1, $2, 'c1', 'b') returning id", [student, lessonId]);
    const [a3] = await q("insert into public.answers (user_id, lesson_id, block_id, files) values ($1, $2, 'u1', $3) returning id", [student, otherLesson, JSON.stringify(files)]);
    // a1: feedback on version 2, answer changed since (version 3): waits for the owner again.
    await q("insert into public.feedback (answer_id, user_id, author_id, text, answer_version) values ($1, $2, $3, 'Goed begin', 2)", [a1.id, student, owner]);
    await q("insert into public.lesson_completions (user_id, lesson_id) values ($1, $2)", [student, lessonId]);

    // A published lesson with unpublished changes (migration 0030): the draft is converted too.
    const draft = { title: "L", summary: "", blocks: [blocks[0], { id: "q2", type: "question", kind: "open", prompt: "Nieuw", helpText: "", required: false, feedback: false }] };
    await q("update public.lessons set draft = $1 where id = $2", [JSON.stringify(draft), lessonId]);

    await client.query(MIGRATION);
    await client.query(MIGRATION);

    const [withDraft] = await q("select draft from public.lessons where id = $1", [lessonId]);
    expect(withDraft.draft.title).toBe("L");
    expect(withDraft.draft.blocks.map((b: { id: string; type: string }) => `${b.id}:${b.type}`)).toEqual(["v:video", "q2:assignment"]);
    expect(withDraft.draft.blocks[1]).toEqual(legacyToAssignment(draft.blocks[1] as LegacyBlock));

    const [lesson] = await q("select blocks from public.lessons where id = $1", [lessonId]);
    expect(lesson.blocks.map((b: { id: string; type: string }) => `${b.id}:${b.type}`)).toEqual(["v:video", "q1:assignment", "c1:assignment", "u1:assignment"]);
    expect(lesson.blocks[1]).toEqual(legacyToAssignment(blocks[1] as LegacyBlock));

    const subs = await q("select * from public.assignment_submissions where user_id = $1 order by block_id", [student]);
    expect(subs.map((s) => [s.block_id, s.status, s.feedback_requested])).toEqual([
      ["c1", "ingediend", false],
      ["q1", "ingediend", true],
      // Answered in a lesson without that block (deleted since): a stand-in assignment, a draft as the
      // lesson was not completed, and no feedback request as the stand-in does not allow one.
      ["u1", "concept", false],
    ]);
    expect(subs.find((s) => s.block_id === "q1").draft).toEqual({ "q1-f1": { text: "Mijn tekst" } });
    expect(subs.find((s) => s.block_id === "c1").draft).toEqual({ "c1-f1": { choice: "b" } });
    expect(subs.find((s) => s.block_id === "u1").draft).toEqual({ "u1-f1": { files } });
    expect(subs.map((s) => s.legacy_answer_id).sort()).toEqual([a1.id, a2.id, a3.id].sort());

    const versions = await q("select v.*, s.block_id from public.submission_versions v join public.assignment_submissions s on s.id = v.submission_id where v.user_id = $1 order by s.block_id", [student]);
    expect(versions.map((v) => [v.block_id, v.version, v.feedback_status])).toEqual([
      ["c1", 1, null],
      ["q1", 1, "nieuw"],
    ]);
    const feedback = await q("select * from public.assignment_feedback where user_id = $1", [student]);
    expect(feedback).toHaveLength(1);
    expect(feedback[0]).toMatchObject({ text: "Goed begin", version_id: versions[1].id });
    expect(feedback[0].sent_at).not.toBeNull();
    // The old tables are untouched.
    expect((await q("select count(*)::int as n from public.answers where user_id = $1", [student]))[0].n).toBe(3);
  });
});

describe.skipIf(!url)("opdrachten in de database", () => {
  const [student, owner, moduleId, lessonId, lesson2Id] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  let db: typeof import("@/lib/db");
  let data: typeof import("@/lib/data/assignments");
  let store: import("@/lib/data").DataStore;

  const field = (id: string, required = true) => ({ id, type: "short" as const, label: id, help: "", required });
  const assignment = (id: string, extra: Partial<AssignmentBlock> = {}): AssignmentBlock => ({
    id,
    type: "assignment",
    title: id,
    intro: "",
    requiredForLesson: true,
    feedbackAllowed: true,
    graded: false,
    repeatOf: null,
    parts: [{ id: `${id}-p`, title: "", intro: "", fields: [field(`${id}-a`), field(`${id}-b`, false), { id: `${id}-upl`, type: "upload", label: "Bestand", help: "", required: false, accept: ["pdf"], maxFiles: 1 }] }],
    ...extra,
  });
  const lesson: Lesson = { id: lessonId, moduleId, title: "L", summary: "", position: 1, blocks: [assignment("o1"), assignment("o2", { requiredForLesson: false })] };
  const lesson2: Lesson = { id: lesson2Id, moduleId, title: "L2", summary: "", position: 2, blocks: [assignment("o3"), assignment("o4")] };
  const input = (l: Lesson, a: AssignmentBlock, expectedVersion: number, answers: unknown = {}, feedbackRequested = false) => ({
    userId: student,
    lesson: l,
    assignment: a,
    expectedVersion,
    answers,
    feedbackRequested,
    questionForSabine: "Klopt mijn aanpak?",
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    delete process.env.SUPABASE_URL;
    db = await import("@/lib/db");
    data = await import("@/lib/data/assignments");
    store = (await import("@/lib/data")).getStore();
    await db.query("insert into auth.users (id, email) values ($1, $2), ($3, $4)", [student, `t-${student}@x.nl`, owner, `t-${owner}@x.nl`]);
    await db.query("insert into public.users (id, email, name, role) values ($1, $2, 'S', 'student'), ($3, $4, 'O', 'owner')", [student, `t-${student}@x.nl`, owner, `t-${owner}@x.nl`]);
    await store.saveModule({ id: moduleId, title: "M", description: "", position: 98 });
    await store.saveLesson(lesson);
    await store.saveLesson(lesson2);
  });

  afterAll(async () => {
    if (!db) return;
    await db.query("delete from public.assignment_feedback where author_id = $1", [owner]);
    await db.query("delete from public.module_unlocks where unlocked_by = $1", [owner]);
    await db.query("delete from public.modules where id = $1", [moduleId]);
    await db.query("delete from auth.users where id = any($1)", [[student, owner]]);
    await db.query("delete from public.users where id = any($1)", [[student, owner]]);
    await db.pool().end();
  });

  it("concept opslaan met optimistic locking", async () => {
    const a = lesson.blocks[0] as AssignmentBlock;
    const first = await data.saveDraft(input(lesson, a, 0, { "o1-b": { text: "half" } }));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.submission).toMatchObject({ status: "concept", draftVersion: 1, draft: { "o1-b": { text: "half" } } });
    // A second tab that still has version 0 is refused and gets the saved draft.
    const stale = await data.saveDraft(input(lesson, a, 0, { "o1-b": { text: "ander tabblad" } }));
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.submission.draft).toEqual({ "o1-b": { text: "half" } });
    const forced = await data.saveDraft({ ...input(lesson, a, 0, { "o1-b": { text: "toch deze" } }), force: true });
    expect(forced.ok && forced.submission.draftVersion).toBe(2);
  });

  it("indienen controleert verplichte velden; elke keer indienen is een nieuwe versie; de les rondt af", async () => {
    const a = lesson.blocks[0] as AssignmentBlock;
    const missing = await data.submitAssignment(input(lesson, a, 2));
    expect(missing.ok).toBe(false);
    if (!missing.ok && missing.reason === "missing") expect(missing.missing).toEqual(["o1-a"]);
    // The draft was saved all the same.
    const [sub] = await data.listSubmissions({ userId: student, lessonId });
    expect(sub).toMatchObject({ status: "concept", draftVersion: 3 });

    const ok = await data.submitAssignment(input(lesson, a, 3, { "o1-a": { text: "klaar" } }, true));
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.version).toMatchObject({ version: 1, feedbackRequested: true, feedbackStatus: "nieuw", questionForSabine: "Klopt mijn aanpak?" });
    expect(ok.version.assignment).toEqual(a);
    expect(ok.version.answers["o1-a"]).toEqual({ text: "klaar" });
    // o2 is optional for the lesson, so o1 alone completes it.
    expect(ok.lessonCompleted).toBe(true);
    expect((await store.listCompletions(student)).map((c) => c.lessonId)).toContain(lessonId);

    const again = await data.submitAssignment(input(lesson, a, ok.submission.draftVersion, { "o1-a": { text: "beter" } }, true));
    expect(again.ok && again.version.version).toBe(2);
    expect(again.ok && again.lessonCompleted).toBe(false); // already completed
    const versions = await data.listVersions({ submissionId: ok.submission.id });
    expect(versions.map((v) => v.answers["o1-a"]?.text)).toEqual(["klaar", "beter"]);
  });

  it("maximaal twee feedbackverzoeken per module, ook bij gelijktijdige verzoeken", async () => {
    // o1 already has a request. One slot left in this module for o2, o3 and o4.
    expect(await data.feedbackRequestsInModule(student, moduleId)).toBe(1);
    const [r2, r3] = await Promise.all([
      data.saveDraft(input(lesson, lesson.blocks[1] as AssignmentBlock, 0, {}, true)),
      data.saveDraft(input(lesson2, lesson2.blocks[0] as AssignmentBlock, 0, {}, true)),
    ]);
    const granted = [r2, r3].filter((r) => r.ok && r.submission.feedbackRequested);
    const refused = [r2, r3].filter((r) => r.ok && r.feedbackRefused);
    expect(granted).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(await data.feedbackRequestsInModule(student, moduleId)).toBe(2);
    const r4 = await data.saveDraft(input(lesson2, lesson2.blocks[1] as AssignmentBlock, 0, { "o4-a": { text: "x" } }, true));
    expect(r4.ok && r4.feedbackRefused).toBe(true);
    expect(r4.ok && r4.submission.draft).toEqual({ "o4-a": { text: "x" } }); // the answers are saved anyway

    // Changing your mind before submitting frees the slot.
    const holder = granted[0];
    if (!holder.ok) return;
    const holderLesson = holder.submission.lessonId === lessonId ? lesson : lesson2;
    const holderBlock = holderLesson.blocks.find((b) => b.id === holder.submission.blockId) as AssignmentBlock;
    await data.saveDraft(input(holderLesson, holderBlock, holder.submission.draftVersion, {}, false));
    expect(await data.feedbackRequestsInModule(student, moduleId)).toBe(1);
  });

  it("uploads per veld: het maximum aantal wordt in de transactie gecontroleerd", async () => {
    const a = lesson2.blocks[1] as AssignmentBlock;
    const upload = a.parts[0].fields[2] as Extract<AssignmentBlock["parts"][number]["fields"][number], { type: "upload" }>;
    const file = { id: randomUUID(), name: "a.pdf", size: 5, mime: "application/pdf" };
    const first = await data.addDraftFile(student, lesson2Id, a, upload, file);
    expect(first.ok && first.submission.draft["o4-upl"]).toEqual({ files: [file] });
    const second = await data.addDraftFile(student, lesson2Id, a, upload, { ...file, id: randomUUID() });
    expect(second.ok).toBe(false);
    // Removing it again goes through the draft (keep list).
    if (!first.ok) return;
    const removed = await data.saveDraft(input(lesson2, a, first.submission.draftVersion, { "o4-upl": { keep: [] } }));
    expect(removed.ok && removed.submission.draft["o4-upl"]).toEqual({ files: [] });
  });

  it("feedback hangt aan een versie en sluit het verzoek af", async () => {
    const [version] = (await data.listVersions({ userId: student })).filter((v) => v.feedbackStatus === "nieuw");
    const draft = await data.addAssignmentFeedback({ version, authorId: owner, text: "Concept", attachment: null, send: false });
    expect(draft.sentAt).toBeNull();
    expect((await data.getVersion(version.id))?.feedbackStatus).toBe("in_behandeling");
    expect(await data.listAssignmentFeedback({ userId: student, sentOnly: true })).toHaveLength(0);
    await data.addAssignmentFeedback({ version, authorId: owner, text: "Mooi", attachment: null, send: true });
    expect((await data.getVersion(version.id))?.feedbackStatus).toBe("afgerond");
    expect((await data.listAssignmentFeedback({ userId: student, sentOnly: true })).map((f) => f.text)).toEqual(["Mooi"]);
  });

  it("module handmatig vrijgeven en weer intrekken", async () => {
    await data.unlockModule(student, moduleId, owner);
    await data.unlockModule(student, moduleId, owner);
    expect((await data.listUnlocks(student)).map((u) => u.moduleId)).toEqual([moduleId]);
    await data.relockModule(student, moduleId);
    expect(await data.listUnlocks(student)).toEqual([]);
  });
});
