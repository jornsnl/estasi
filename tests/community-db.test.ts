import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The community queries against a real, migrated database (migration 0026):
 * hidden items, unread counters, private conversations and bundled mail.
 * Runs only with TEST_DATABASE_URL, for example:
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/estasi_i npm test
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("community in Postgres", () => {
  const ownerId = randomUUID();
  const aId = randomUUID();
  const bId = randomUUID();
  const ids = [ownerId, aId, bId];
  let db: typeof import("@/lib/db");
  let server: typeof import("@/lib/community/server");
  let notify: typeof import("@/lib/community/notify");
  const owner = { id: ownerId, role: "owner" as const, access: "active" as const };
  const a = { id: aId, role: "student" as const, access: "active" as const };
  const b = { id: bId, role: "student" as const, access: "active" as const };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    delete process.env.SUPABASE_URL;
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_HOST;
    db = await import("@/lib/db");
    server = await import("@/lib/community/server");
    notify = await import("@/lib/community/notify");
    for (const [n, id] of ids.entries()) {
      await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `c${n}-${id.slice(0, 8)}@voorbeeld.nl`]);
      await db.query("insert into public.users (id, email, name, role, activated_at) values ($1, $2, $3, $4, now())", [
        id,
        `c${n}-${id.slice(0, 8)}@voorbeeld.nl`,
        `Test ${n}`,
        n === 0 ? "owner" : "student",
      ]);
      if (n > 0) {
        await db.query(
          "insert into public.enrollments (user_id, package, purchased_at, ends_at) values ($1, 'A', now(), now() + interval '1 year')",
          [id],
        );
      }
    }
  });

  afterAll(async () => {
    if (!db) return;
    await db.query("delete from public.users where id = any($1)", [ids]);
    await db.query("delete from auth.users where id = any($1)", [ids]);
    await db.pool().end();
  });

  it("hidden posts and comments: only Sabine and the author", async () => {
    const post = await db.one<{ id: string }>("insert into public.community_posts (author_id, body) values ($1, 'hoi') returning id", [aId]);
    const hidden = await db.one<{ id: string }>(
      "insert into public.community_posts (author_id, body, hidden_at) values ($1, 'weg', now()) returning id",
      [aId],
    );
    await db.query("insert into public.community_comments (post_id, author_id, body, hidden_at) values ($1, $2, 'stil', now())", [post!.id, bId]);
    const seenBy = async (viewer: import("@/lib/community/rules").Viewer) => (await server.listPosts(viewer)).posts.filter((p) => [post!.id, hidden!.id].includes(p.id));

    expect((await seenBy(b)).map((p) => p.id)).toEqual([post!.id]);
    expect((await seenBy(b))[0].comments).toHaveLength(1); // b wrote the hidden comment
    expect((await seenBy(a)).map((p) => p.id).sort()).toEqual([post!.id, hidden!.id].sort());
    expect((await seenBy(a)).find((p) => p.id === post!.id)!.comments).toHaveLength(0);
    expect(await seenBy(owner)).toHaveLength(2);
    expect(await server.getPost(b, hidden!.id)).toBeNull();
    expect(await server.getPost({ ...b, access: "expired" }, post!.id)).toBeNull();
  });

  it("unread counters follow the last visit", async () => {
    expect(await server.unreadCommunity(b)).toBeGreaterThan(0);
    await server.markCommunitySeen(bId);
    expect(await server.unreadCommunity(b)).toBe(0);
    expect(await server.unreadCommunity({ ...b, access: "paused" })).toBe(0);
  });

  it("a private conversation is only for its student and Sabine", async () => {
    await db.query("insert into public.private_messages (student_id, author_id, body) values ($1, $2, 'privé')", [aId, ownerId]);
    expect(await server.listMessages(a, aId)).toHaveLength(1);
    expect(await server.listMessages(b, aId)).toHaveLength(0);
    expect(await server.listMessages(owner, aId)).toHaveLength(1);
    expect(await server.unreadPrivate(a)).toBe(1);
    expect(await server.unreadPrivate(b)).toBe(0);
    await server.markConversationRead(a, aId);
    expect(await server.unreadPrivate(a)).toBe(0);
  });

  it("bundles the mail: news once, then nothing inside the hour", async () => {
    // Only this test's people: give everyone else's rows nothing to do by running and checking ours.
    await db.query("delete from public.community_members where user_id = any($1)", [ids]);
    await notify.processNotifications(); // first run: rows made, nothing mailed
    const before = await db.one<{ community_mailed_at: Date | null }>("select community_mailed_at from public.community_members where user_id = $1", [bId]);
    expect(before?.community_mailed_at).toBeNull();

    await db.query("insert into public.community_posts (author_id, body) values ($1, 'nieuw')", [aId]);
    await notify.processNotifications();
    const first = await db.one<{ community_mailed_at: Date | null }>("select community_mailed_at from public.community_members where user_id = $1", [bId]);
    expect(first?.community_mailed_at).not.toBeNull();
    // The author is not mailed about the own post.
    const author = await db.one<{ community_mailed_at: Date | null }>("select community_mailed_at from public.community_members where user_id = $1", [aId]);
    expect(author?.community_mailed_at).toBeNull();

    await db.query("insert into public.community_posts (author_id, body) values ($1, 'nog een')", [aId]);
    await notify.processNotifications();
    const second = await db.one<{ community_mailed_at: Date | null }>("select community_mailed_at from public.community_members where user_id = $1", [bId]);
    expect(second?.community_mailed_at?.toISOString()).toBe(first?.community_mailed_at?.toISOString());
  });
});
