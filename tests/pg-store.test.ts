import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Answer, Lesson, User } from "@/lib/data/types";
import { legacyToAssignment } from "@/lib/domain/assignment";

/**
 * The Postgres stores against a real, migrated database. Runs only with
 * TEST_DATABASE_URL set, for example:
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/estasi_f npm test
 * Everything it makes is removed again afterwards.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Postgres stores", () => {
  const userId = randomUUID();
  const ownerId = randomUUID();
  const moduleId = randomUUID();
  const lessonId = randomUUID();
  const email = `test-${userId.slice(0, 8)}@voorbeeld.nl`;
  let db: typeof import("@/lib/db");
  let store: import("@/lib/data").DataStore;
  let files: import("@/lib/data").FileStorage;
  let security: import("@/lib/security/store").SecurityStore;
  const now = "2026-05-01T10:00:00.000Z";

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    delete process.env.SUPABASE_URL;
    db = await import("@/lib/db");
    const data = await import("@/lib/data");
    store = data.getStore();
    files = data.getFiles();
    security = (await import("@/lib/security/store")).getSecurityStore();
    await db.query("insert into auth.users (id, email) values ($1, $2), ($3, $4)", [userId, email, ownerId, `o-${email}`]);
  });

  afterAll(async () => {
    if (!db) return;
    await db.query("delete from public.feedback where author_id = $1", [ownerId]);
    await db.query("delete from public.audit_log where actor_id = $1 or actor_id = $2", [ownerId, userId]);
    await db.query("delete from public.files where uploaded_by = $1 or uploaded_by = $2", [ownerId, userId]);
    await db.query("delete from public.modules where id = $1", [moduleId]);
    await db.query("delete from public.oauth_clients where id = $1", [`test-${userId}`]);
    await db.query("delete from auth.users where id = any($1)", [[userId, ownerId]]);
    await db.query("delete from public.users where id = any($1)", [[userId, ownerId]]);
    await db.pool().end();
  });

  it("users, profiles and enrollments", async () => {
    const user: User = { id: userId, email: email.toUpperCase(), name: "Test", role: "student", activatedAt: null, createdAt: now, lastActiveAt: null };
    expect(await store.createUser(user)).toEqual({ ...user, email });
    await store.createUser({ ...user, id: ownerId, email: `o-${email}`, role: "owner" });
    expect((await store.getUserByEmail(` ${email.toUpperCase()} `))?.id).toBe(userId);
    expect(await store.getUser("geen-uuid")).toBeNull();
    expect((await store.updateUser(userId, { name: "Nieuw" })).name).toBe("Nieuw");
    expect((await store.listUsers("owner")).some((u) => u.id === ownerId)).toBe(true);
    await expect(store.updateUser(randomUUID(), { name: "x" })).rejects.toThrow("Niet gevonden");

    const profile = { userId, phone: "06", city: "Utrecht", companyName: "", photoFileId: null, instagram: "", website: "", intro: "", goals: "", updatedAt: now };
    await store.saveProfile(profile);
    expect(await store.saveProfile({ ...profile, city: "Zwolle" })).toEqual({ ...profile, city: "Zwolle" });

    const enrollment = await store.createEnrollment({
      id: randomUUID(), userId, package: "A", purchasedAt: now, endsAt: "2027-05-01T10:00:00.000Z", pausedAt: null, pauses: [],
      revokedAt: null, onlineCompletedAt: null, certificateReleasedAt: null, certificateCode: null, practicalStatus: "none",
      practicalCertificateReleasedAt: null, practicalCertificateCode: null, ownerNotes: "",
    });
    const paused = await store.updateEnrollment(enrollment.id, { pausedAt: now, pauses: [{ pausedAt: now, resumedAt: null }] });
    expect(paused.pauses).toEqual([{ pausedAt: now, resumedAt: null }]);
    expect((await store.getEnrollmentForUser(userId))?.pausedAt).toBe(now);
  });

  it("content, answers, feedback and completions", async () => {
    // Without the newer fields a module is published and for both packages.
    expect(await store.saveModule({ id: moduleId, title: "M", description: "", position: 99 })).toMatchObject({ status: "published", packages: "AB" });
    expect(await store.saveModule({ id: moduleId, title: "M", description: "", position: 99, status: "draft", packages: "B" })).toMatchObject({ status: "draft", packages: "B" });
    const legacy = { id: "b1", type: "question", kind: "open", prompt: "?", helpText: "", required: true, feedback: true } as const;
    const lesson: Lesson = {
      id: lessonId, moduleId, title: "L", summary: "", position: 1,
      blocks: [legacyToAssignment(legacy)],
      status: "published", draft: null, publishedAt: null,
    };
    // An old question block in the database (live or in a draft) is read as an assignment with the same id.
    expect(await store.saveLesson({ ...lesson, blocks: [legacy as never] })).toEqual(lesson);
    expect((await store.saveLesson({ ...lesson, draft: { title: "L", summary: "", blocks: [legacy as never] } })).draft?.blocks).toEqual(lesson.blocks);
    expect(await store.saveLesson(lesson)).toEqual(lesson);
    expect(await store.saveLesson({ ...lesson, title: "L2" })).toEqual({ ...lesson, title: "L2" });
    // A draft of a published lesson is stored next to the live blocks.
    const draft = { title: "L3", summary: "", blocks: [{ id: "b2", type: "text" as const, markdown: "", html: "<p>x</p>" }] };
    expect((await store.saveLesson({ ...lesson, draft, publishedAt: now })).draft).toEqual(draft);
    expect((await store.getLesson(lessonId))?.publishedAt).toBe(now);
    expect((await store.listLessons(moduleId)).map((l) => l.id)).toEqual([lessonId]);
    expect(await store.listLessons("geen-uuid")).toEqual([]);

    const answer: Answer = { id: randomUUID(), userId, lessonId, blockId: "b1", text: "Antwoord", choice: null, files: [], version: 1, createdAt: now, updatedAt: now };
    await store.saveAnswer(answer);
    const file = { id: randomUUID(), name: "x.pdf", size: 3, mime: "application/pdf" };
    await store.saveAnswer({ ...answer, version: 2, files: [file] });
    expect(await store.getAnswer(answer.id)).toEqual({ ...answer, version: 2, files: [file] });
    expect(await store.listAnswers({ userId, lessonId })).toHaveLength(1);

    await store.createFeedback({ id: randomUUID(), answerId: answer.id, userId, authorId: ownerId, text: "Goed", attachment: null, answerVersion: 2, createdAt: now });
    expect((await store.listFeedback({ answerId: answer.id }))[0].text).toBe("Goed");

    await store.setCompletion({ userId, lessonId, completedAt: now });
    await store.setCompletion({ userId, lessonId, completedAt: "2026-05-02T10:00:00.000Z" });
    expect(await store.listCompletions(userId)).toEqual([{ userId, lessonId, completedAt: "2026-05-02T10:00:00.000Z" }]);

    await store.deleteModule(moduleId);
    expect(await store.getLesson(lessonId)).toBeNull();
    // Answers outlive the lesson (retention policy).
    expect(await store.getAnswer(answer.id)).not.toBeNull();
  });

  it("audit log and settings", async () => {
    await store.addAudit({ id: randomUUID(), at: "2026-05-01T10:00:00.000Z", actorId: ownerId, targetUserId: userId, action: "Eerste", details: "" });
    await store.addAudit({ id: randomUUID(), at: "2026-05-02T10:00:00.000Z", actorId: ownerId, targetUserId: userId, action: "Tweede", details: "" });
    expect((await store.listAudit(userId)).map((a) => a.action)).toEqual(["Tweede", "Eerste"]);
    const settings = await store.getSettings();
    expect(await store.saveSettings({ ...settings })).toEqual(settings);
  });

  it("files without Supabase are kept in Postgres", async () => {
    const ref = await files.save(Buffer.from("hallo"), { name: "a.txt", mime: "text/plain", belongsTo: userId, uploadedBy: userId });
    const read = await files.read(ref.id);
    expect(read?.data.toString()).toBe("hallo");
    expect(read?.meta).toMatchObject({ name: "a.txt", size: 5, belongsTo: userId, uploadedBy: userId });
    expect(await files.read(randomUUID())).toBeNull();
  });

  it("passkeys, OAuth codes and grants", async () => {
    const passkey = { id: `pk-${userId}`, userId: ownerId, publicKey: "k", counter: 3, transports: ["internal"], deviceType: "multiDevice", backedUp: true, name: "iPhone", createdAt: now, lastUsedAt: null };
    await security.savePasskey(passkey);
    await security.savePasskey({ ...passkey, counter: 4 });
    expect(await security.getPasskey(passkey.id)).toEqual({ ...passkey, counter: 4 });

    const clientId = `test-${userId}`;
    await security.saveClient({ id: clientId, name: "Claude", secretHash: null, redirectUris: ["https://claude.ai/cb"], source: "dynamic", clientUri: "", createdAt: now });
    expect((await security.getClient(clientId))?.redirectUris).toEqual(["https://claude.ai/cb"]);

    const code = { codeHash: `c-${userId}`, clientId, userId: ownerId, redirectUri: "https://claude.ai/cb", codeChallenge: "x", scope: ["read" as const], resource: "", expiresAt: "2999-01-01T00:00:00.000Z" };
    await security.saveCode(code);
    expect(await security.takeCode(code.codeHash)).toEqual(code);
    expect(await security.takeCode(code.codeHash)).toBeNull();

    const grant = {
      id: randomUUID(), clientId, userId: ownerId, scope: ["read" as const], resource: "", accessHash: `a-${userId}`, accessExpiresAt: now,
      refreshHash: `r-${userId}`, refreshExpiresAt: now, createdAt: now, lastUsedAt: null, revokedAt: null,
    };
    await security.saveGrant(grant);
    expect(await security.rotateGrant(grant.id, grant.refreshHash, { refreshHash: `r2-${userId}` })).toBe(true);
    expect(await security.rotateGrant(grant.id, grant.refreshHash, { refreshHash: `r3-${userId}` })).toBe(false);
    expect((await security.grantByRefreshHash(`r2-${userId}`))?.id).toBe(grant.id);
    await security.deleteClient(clientId);
    expect(await security.getGrant(grant.id)).toBeNull();
  });
});
