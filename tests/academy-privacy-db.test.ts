import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AssignmentBlock, Lesson, User } from "@/lib/data/types";

/**
 * Portfolio, data export, permanent deletion and the notices before access
 * ends, against a real, migrated database (migrations up to 0029). Runs only
 * with TEST_DATABASE_URL, for example:
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/estasi_h2 npm test
 */
const url = process.env.TEST_DATABASE_URL;

const assignment = (label: string): AssignmentBlock => ({
  id: "opdracht-1",
  type: "assignment",
  title: "Mijn visie",
  intro: "",
  requiredForLesson: true,
  feedbackAllowed: true,
  graded: false,
  repeatOf: null,
  parts: [{ id: "p", title: "", intro: "", fields: [{ id: "veld", type: "long", label, help: "", required: true }] }],
});

describe.skipIf(!url)("privacy en portfolio in Postgres", () => {
  const ownerId = randomUUID();
  const sId = randomUUID();
  const tId = randomUUID();
  const uId = randomUUID();
  const ids = [ownerId, sId, tId, uId];
  const moduleId = randomUUID();
  const lessonId = randomUUID();
  const email = (id: string) => `p-${id.slice(0, 8)}@voorbeeld.nl`;
  let db: typeof import("@/lib/db");
  let privacy: typeof import("@/lib/data/privacy");
  let portfolio: typeof import("@/lib/portfolio");
  let expiry: typeof import("@/lib/academy-expiry");
  let data: typeof import("@/lib/data");
  let student: User;
  let lesson: Lesson;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    delete process.env.SUPABASE_URL;
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_HOST;
    db = await import("@/lib/db");
    privacy = await import("@/lib/data/privacy");
    portfolio = await import("@/lib/portfolio");
    expiry = await import("@/lib/academy-expiry");
    data = await import("@/lib/data");
    for (const [n, id] of ids.entries()) {
      await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email(id)]);
      // S and T stay unactivated and their community items hidden and read, so the community
      // mails (tests/community-db.test.ts may run at the same time) never pick them up.
      await db.query("insert into public.users (id, email, name, role, activated_at) values ($1, $2, $3, $4, case when $5 then now() end)", [
        id,
        email(id),
        n === 0 ? "Opleider Test" : `Cursist ${n}`,
        n === 0 ? "owner" : "student",
        n === 0 || id === uId,
      ]);
      if (n > 0) {
        await db.query("insert into public.enrollments (user_id, package, purchased_at, ends_at) values ($1, 'A', now(), now() + interval '1 year')", [id]);
      }
    }
    await db.query("insert into public.profiles (user_id, phone, city) values ($1, '0612345678', 'Utrecht')", [sId]);
    await db.query("insert into public.modules (id, title, position) values ($1, 'Privacy-module', 990)", [moduleId]);
    lesson = await data.getStore().saveLesson({ id: lessonId, moduleId, title: "Privacy-les", summary: "", position: 1, blocks: [assignment("Vraag zoals hij was")] });
    student = (await data.getStore().getUser(sId))!;
  });

  afterAll(async () => {
    if (!db) return;
    await db.query("delete from public.community_posts where author_id = any($1)", [ids]);
    await db.query("delete from public.audit_log where actor_id = any($1) or target_user_id = any($1)", [ids]);
    await db.query("delete from public.files where belongs_to = any($1) or uploaded_by = any($1)", [ids]);
    await db.query("delete from wedding_space.mail_log where to_email = any($1)", [ids.map(email)]);
    await db.query("delete from public.users where id = any($1)", [ids]);
    await db.query("delete from auth.users where id = any($1)", [ids]);
    await db.query("delete from public.modules where id = $1", [moduleId]);
    await db.pool().end();
  });

  it("ingeleverd werk blijft in het portfolio, ook als de les daarna verandert", async () => {
    const { submitAssignment } = await import("@/lib/data/assignments");
    const result = await submitAssignment({
      userId: sId,
      lesson,
      assignment: assignment("Vraag zoals hij was"),
      expectedVersion: 0,
      answers: { veld: { text: "Mijn antwoord" } },
      feedbackRequested: true,
      questionForSabine: "Is dit goed?",
    });
    expect(result.ok).toBe(true);
    // Sabine rewrites the question and then removes the assignment from the lesson.
    await data.getStore().saveLesson({ ...lesson, blocks: [assignment("Nieuwe vraag")] });
    await data.getStore().saveLesson({ ...lesson, blocks: [] });
    const view = await portfolio.loadPortfolio(sId, "student");
    const item = view[0].lessons[0].items[0];
    expect(item.versions).toHaveLength(1);
    expect(item.versions[0].assignment.parts[0].fields[0].label).toBe("Vraag zoals hij was");
    expect(item.versions[0].answers.veld.text).toBe("Mijn antwoord");
    // Another student's portfolio has none of it.
    expect(await portfolio.loadPortfolio(tId, "student")).toEqual([]);
  });

  it("inzage: alles over de persoon, zonder sleutels, als zip", async () => {
    const file = await data.getFiles().save(Buffer.from("pdf-bytes"), { name: "plan.pdf", mime: "application/pdf", belongsTo: sId, uploadedBy: sId });
    await db.query("insert into public.private_messages (student_id, author_id, body, read_at) values ($1, $2, 'Hoi Sabine', now())", [sId, sId]);
    await db.query("insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'geheim1', 'geheim2')", [sId, `https://push.example.com/${sId}`]);
    await db.query("insert into public.audit_log (actor_id, target_user_id, action) values ($1, $2, 'Toegang verlengd')", [ownerId, sId]);
    await db.query("insert into wedding_space.mail_log (kind, to_email, subject, body, status, transport) values ('toegang', $1, 'Test', 'x', 'sent', 'log')", [email(sId)]);

    const sections = await privacy.collectPersonalData(student);
    const get = (key: string) => sections.find((s) => s.key === key)!.rows;
    expect(get("profiel")[0].city).toBe("Utrecht");
    expect(get("versies")).toHaveLength(1);
    expect(get("privéberichten")[0].body).toBe("Hoi Sabine");
    expect(get("bestanden").map((r) => r.id)).toContain(file.id);
    expect(get("logboek").map((r) => r.action)).toContain("Toegang verlengd");
    expect(get("mails")).toHaveLength(1);
    expect(get("pushmeldingen")[0]).not.toHaveProperty("p256dh");
    expect(get("pushmeldingen")[0].endpoint).toBe("push.example.com");
    expect(JSON.stringify(sections)).not.toContain("geheim");

    const zip = await privacy.inzageZip(student);
    const dir = mkdtempSync(path.join(tmpdir(), "inzage-"));
    try {
      writeFileSync(path.join(dir, "x.zip"), zip.data);
      execFileSync("unzip", ["-q", path.join(dir, "x.zip"), "-d", path.join(dir, "uit")]);
      const json = JSON.parse(readFileSync(path.join(dir, "uit", "gegevens.json"), "utf8"));
      expect(json.onderdelen.length).toBeGreaterThan(10);
      expect(readFileSync(path.join(dir, "uit", "bestanden", "overig", "plan.pdf"), "utf8")).toBe("pdf-bytes");
      expect(readFileSync(path.join(dir, "uit", "portfolio.html"), "utf8")).toContain("Mijn antwoord");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("definitief verwijderen: alles weg, anderen blijven, één logregel zonder persoonsgegevens", async () => {
    // S posts; T reacts with an attachment. T posts; S reacts.
    const sPost = await db.one<{ id: string }>("insert into public.community_posts (author_id, body, hidden_at) values ($1, 'van S', now()) returning id", [sId]);
    const tComment = await db.one<{ id: string }>("insert into public.community_comments (post_id, author_id, body, hidden_at) values ($1, $2, 'T reageert', now()) returning id", [sPost!.id, tId]);
    const tFile = await data.getFiles().save(Buffer.from("foto"), { name: "foto.jpg", mime: "image/jpeg", belongsTo: tId, uploadedBy: tId });
    await db.query("insert into public.community_attachments (file_id, uploader_id, comment_id, kind) values ($1, $2, $3, 'image')", [tFile.id, tId, tComment!.id]);
    const tPost = await db.one<{ id: string }>("insert into public.community_posts (author_id, body, hidden_at) values ($1, 'van T', now()) returning id", [tId]);
    await db.query("insert into public.community_comments (post_id, author_id, body, hidden_at) values ($1, $2, 'S reageert', now())", [tPost!.id, sId]);
    const tOwnFile = await data.getFiles().save(Buffer.from("t"), { name: "t.pdf", mime: "application/pdf", belongsTo: tId, uploadedBy: tId });

    expect(await privacy.deleteStudent(randomUUID(), ownerId)).toBeNull();
    const result = await privacy.deleteStudent(sId, ownerId);
    expect(result).not.toBeNull();
    expect(result!.warnings).toEqual([]);
    expect(await privacy.remainingRows(sId)).toBe(0);
    expect(await db.one("select 1 from auth.users where id = $1", [sId])).toBeNull();
    expect(await db.one("select 1 from public.enrollments where user_id = $1", [sId])).toBeNull();
    expect(await db.one("select 1 from public.submission_versions where user_id = $1", [sId])).toBeNull();
    expect(await db.one("select 1 from public.push_subscriptions where user_id = $1", [sId])).toBeNull();
    expect(await db.one("select 1 from wedding_space.mail_log where to_email = $1", [email(sId)])).toBeNull();
    // The reaction of T under S's post went with the post, and so did its photo.
    expect(await db.one("select 1 from public.files where id = $1", [tFile.id])).toBeNull();
    // T's own post and other files stay; S's reaction under it is gone.
    expect(await db.one("select 1 from public.community_posts where id = $1", [tPost!.id])).not.toBeNull();
    expect(await db.one("select 1 from public.files where id = $1", [tOwnFile.id])).not.toBeNull();
    expect((await db.query("select * from public.community_comments where post_id = $1", [tPost!.id])).length).toBe(0);
    const log = await db.query<{ action: string; details: string; target_user_id: string | null }>(
      "select action, details, target_user_id from public.audit_log where actor_id = $1 and action = 'Cursist definitief verwijderd'",
      [ownerId],
    );
    expect(log).toHaveLength(1);
    expect(log[0].target_user_id).toBeNull();
    expect(log[0].details).not.toContain("Cursist 1");
    expect(log[0].details).not.toContain(email(sId));
  });

  it("meldingen voor het einde van de toegang: eenmalig per drempel, opnieuw na verlengen", async () => {
    const endsAt = new Date(Date.now() + 20 * 86_400_000);
    await db.query("update public.enrollments set ends_at = $2 where user_id = $1", [uId, endsAt]);
    const notices = async () =>
      (await db.query<{ threshold: number }>("select threshold from public.access_notices where user_id = $1 order by threshold desc", [uId])).map((r) => r.threshold);

    // Twenty days left: the 30 day notice, once.
    expect((await expiry.processExpiryNotices(new Date(), true))?.skipped).toBe(false);
    expect(await notices()).toEqual([30]);
    await expiry.processExpiryNotices(new Date(), true);
    expect(await notices()).toEqual([30]);
    // Without force it waits an hour.
    expect((await expiry.processExpiryNotices(new Date()))?.skipped).toBe(true);
    // Five days before the end: the 7 day notice.
    await expiry.processExpiryNotices(new Date(endsAt.getTime() - 5 * 86_400_000), true);
    expect(await notices()).toEqual([30, 7]);
    // A mail went to the history (not sent: no mail configured), with the export link.
    const mails = await db.query<{ subject: string; body: string }>("select subject, body from wedding_space.mail_log where to_email = $1 and kind = 'toegang' order by created_at", [email(uId)]);
    expect(mails).toHaveLength(2);
    expect(mails[1].body).toContain("/portfolio");
    // Extended: a new end date, so the notices can come again for that date.
    await db.query("update public.enrollments set ends_at = $2 where user_id = $1", [uId, new Date(endsAt.getTime() + 5 * 86_400_000)]);
    await expiry.processExpiryNotices(new Date(), true);
    expect(await notices()).toEqual([30, 30, 7]);
  });
});
