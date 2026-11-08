import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AssignmentBlock, Lesson } from "@/lib/data/types";

/**
 * Feedback and assessment against a real, migrated database (migrations 0025
 * and 0028): concept and send, one concept per version, statuses, the
 * assessment of a final assignment with a new version after "verbetering
 * nodig", the overview and the "seen" badge. Runs only with TEST_DATABASE_URL:
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/estasi_h1 npm test
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("feedback en beoordeling in de database", () => {
  const [student, owner, moduleId, lessonId] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  let db: typeof import("@/lib/db");
  let data: typeof import("@/lib/data/assignments");

  const assignment = (id: string, extra: Partial<AssignmentBlock> = {}): AssignmentBlock => ({
    id,
    type: "assignment",
    title: id,
    intro: "",
    requiredForLesson: true,
    feedbackAllowed: true,
    graded: false,
    repeatOf: null,
    parts: [{ id: `${id}-p`, title: "", intro: "", fields: [{ id: `${id}-a`, type: "long", label: "Antwoord", help: "", required: true }] }],
    ...extra,
  });
  const lesson: Lesson = { id: lessonId, moduleId, title: "Afsluiting", summary: "", position: 1, blocks: [assignment("gewoon"), assignment("eind", { graded: true, feedbackAllowed: false })] };
  const block = (id: string) => lesson.blocks.find((b) => b.id === id) as AssignmentBlock;
  const submit = (id: string, text: string, expectedVersion: number, feedbackRequested = false) =>
    data.submitAssignment({
      userId: student,
      lesson,
      assignment: block(id),
      expectedVersion,
      answers: { [`${id}-a`]: { text } },
      feedbackRequested,
      questionForSabine: "Is dit zo goed?",
    });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    delete process.env.SUPABASE_URL;
    db = await import("@/lib/db");
    data = await import("@/lib/data/assignments");
    const store = (await import("@/lib/data")).getStore();
    await db.query("insert into auth.users (id, email) values ($1, $2), ($3, $4)", [student, `t-${student}@x.nl`, owner, `t-${owner}@x.nl`]);
    await db.query("insert into public.users (id, email, name, role) values ($1, $2, 'Fien', 'student'), ($3, $4, 'O', 'owner')", [student, `t-${student}@x.nl`, owner, `t-${owner}@x.nl`]);
    await store.saveModule({ id: moduleId, title: "Eindmodule", description: "", position: 97 });
    await store.saveLesson(lesson);
  });

  afterAll(async () => {
    if (!db) return;
    await db.query("delete from public.assignment_feedback where author_id = $1", [owner]);
    await db.query("delete from public.modules where id = $1", [moduleId]);
    await db.query("delete from auth.users where id = any($1)", [[student, owner]]);
    await db.query("delete from public.users where id = any($1)", [[student, owner]]);
    await db.pool().end();
  });

  it("concept, bijwerken en versturen: één concept per versie, status loopt mee", async () => {
    const r = await submit("gewoon", "mijn plan", 0, true);
    expect(r.ok && r.version.feedbackStatus).toBe("nieuw");
    if (!r.ok) return;
    const version = r.version;
    expect(await data.openFeedbackRequestCount()).toBeGreaterThanOrEqual(1);

    const empty = await data.saveFeedback({ version, authorId: owner, text: "  ", send: false });
    expect(empty.ok).toBe(false);

    const first = await data.saveFeedback({ version, authorId: owner, text: "Eerste aanzet", send: false });
    const second = await data.saveFeedback({ version, authorId: owner, text: "Beter verwoord", send: false });
    expect(first.ok && second.ok && first.feedback.id === second.feedback.id).toBe(true);
    expect((await data.getVersion(version.id))?.feedbackStatus).toBe("in_behandeling");
    expect(await data.listAssignmentFeedback({ userId: student, sentOnly: true })).toHaveLength(0);
    expect(await data.unseenFeedback(student)).toHaveLength(0);

    // A concept with an attachment keeps it when nothing new is chosen.
    const file = { id: randomUUID(), name: "tips.pdf", size: 10, mime: "application/pdf" };
    await data.saveFeedback({ version, authorId: owner, text: "Met bijlage", attachment: file, send: false });
    const sent = await data.saveFeedback({ version, authorId: owner, text: "Mooi plan!", send: true });
    expect(sent.ok && sent.feedback.attachment).toEqual(file);
    expect(sent.ok && sent.feedback.sentAt).not.toBeNull();
    expect((await data.getVersion(version.id))?.feedbackStatus).toBe("afgerond");
    expect((await data.listAssignmentFeedback({ userId: student })).map((f) => f.text)).toEqual(["Mooi plan!"]);

    // Badge until the student opened the lesson.
    const unseen = await data.unseenFeedback(student);
    expect(unseen.map((f) => [f.lessonId, f.blockId])).toEqual([[lessonId, "gewoon"]]);
    await data.markFeedbackSeen(student, [version.submissionId]);
    expect(await data.unseenFeedback(student)).toHaveLength(0);

    // Assessing an assignment that is not a final assignment is refused.
    const refused = await data.saveFeedback({ version, authorId: owner, text: "x", assessment: "voldoende", send: true });
    expect(refused.ok).toBe(false);

    // Manual status and throwing a concept away.
    expect(await data.setFeedbackStatus(version.id, "in_behandeling")).toBe(true);
    await data.saveFeedback({ version, authorId: owner, text: "Nog iets", send: false });
    expect(await data.deleteFeedbackConcept(version.id)).toBe(true);
    expect((await data.listAssignmentFeedback({ userId: student })).filter((f) => !f.sentAt)).toHaveLength(0);
  });

  it("eindopdracht: wacht zonder verzoek op beoordeling, verbetering nodig, nieuwe versie, voldoende", async () => {
    const r1 = await submit("eind", "versie een", 0);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.version).toMatchObject({ feedbackRequested: false, feedbackStatus: "nieuw" });

    const overview = await data.listFeedbackRequests({ userId: student });
    const item = overview.find((x) => x.versionId === r1.version.id);
    expect(item).toMatchObject({ studentName: "Fien", lessonTitle: "Afsluiting", moduleTitle: "Eindmodule", feedbackStatus: "nieuw", submissionStatus: "ingediend" });
    expect(item?.answers["eind-a"]).toEqual({ text: "versie een" });

    // In a concept the assessment waits; only sending applies it.
    await data.saveFeedback({ version: r1.version, authorId: owner, text: "Werk de begroting uit.", assessment: "verbetering_nodig", send: false });
    expect((await data.getSubmissionById(r1.submission.id))?.status).toBe("ingediend");
    const sent = await data.saveFeedback({ version: r1.version, authorId: owner, text: "Werk de begroting uit.", assessment: "verbetering_nodig", send: true });
    expect(sent.ok && sent.assessed).toBe("verbetering_nodig");
    expect((await data.getSubmissionById(r1.submission.id))?.status).toBe("verbetering_nodig");
    expect((await data.getVersion(r1.version.id))?.feedbackStatus).toBe("afgerond");

    // The student hands in an improved version: waits for Sabine again.
    const r2 = await submit("eind", "versie twee", r1.submission.draftVersion);
    expect(r2.ok && r2.version).toMatchObject({ version: 2, feedbackStatus: "nieuw" });
    if (!r2.ok) return;
    expect(r2.submission.status).toBe("ingediend");

    // The old version can no longer be assessed.
    const old = await data.saveFeedback({ version: r1.version, authorId: owner, text: "x", assessment: "voldoende", send: true });
    expect(old.ok).toBe(false);
    const ok = await data.saveFeedback({ version: r2.version, authorId: owner, text: "", assessment: "voldoende", send: true });
    expect(ok.ok && ok.assessed).toBe("voldoende");
    expect((await data.getSubmissionById(r1.submission.id))?.status).toBe("voldoende");

    // Assessed as voldoende: no new version any more.
    const r3 = await submit("eind", "versie drie", r2.submission.draftVersion + 1);
    expect(r3.ok === false && r3.reason).toBe("assessed");
  });

  it("migratie 0028 kan opnieuw draaien", async () => {
    const sql = readFileSync(path.join(__dirname, "..", "supabase", "migrations", "0028_academy_feedback_certificaten.sql"), "utf8");
    await db.query(sql);
    await db.query(sql);
    const cols = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'enrollments' and column_name like 'practical_certificate%' order by 1",
    );
    expect(cols.map((c) => c.column_name)).toEqual(["practical_certificate_code", "practical_certificate_released_at"]);
  });
});
