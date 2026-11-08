import "server-only";
import { redirect } from "next/navigation";
import { isUuid, one, query, type Queryable } from "@/lib/db";
import { homeFor, requireUser } from "@/lib/auth/session";
import { getStore, type User } from "@/lib/data";
import { accessStatus } from "@/lib/domain/access";
import { BUCKET, supabaseEnabled } from "@/lib/supabase/config";
import { adminClient } from "@/lib/supabase/server";
import { canReadConversation, canSeeItem, canUseCommunity, isOwner, type AttachmentKind, type Viewer } from "./rules";

/**
 * Reading the community and the private messages (tables from migration
 * 0026). Every function that returns content takes the viewer and applies
 * the rules from rules.ts in the query itself, so nothing reaches a page
 * that its viewer may not see.
 */

export interface CommunityViewer extends Viewer {
  user: User;
}

export async function viewerFor(user: User): Promise<CommunityViewer> {
  if (user.role !== "student") return { id: user.id, role: user.role, access: "active", user };
  const enrollment = await getStore().getEnrollmentForUser(user.id);
  return { id: user.id, role: "student", access: enrollment ? accessStatus(enrollment) : "none", user };
}

/** For pages and actions: signed in as student or owner; couples go to their portal. */
export async function requireViewer(): Promise<CommunityViewer> {
  const user = await requireUser();
  if (user.role === "couple") redirect(homeFor(user));
  return viewerFor(user);
}

export const communityPath = (viewer: Viewer) => (isOwner(viewer) ? "/beheer/community" : "/community");
export const conversationPath = (viewer: Viewer, studentId: string) =>
  isOwner(viewer) ? `/beheer/berichten/${studentId}` : "/prive-chat";

// Shapes -----------------------------------------------------------------------------------------

export interface Author {
  id: string;
  name: string;
  role: "student" | "owner" | "couple";
}

export interface AttachmentView {
  id: string;
  kind: AttachmentKind;
  name: string;
  mime: string;
  size: number;
}

export interface CommentView {
  id: string;
  postId: string;
  author: Author;
  body: string;
  hiddenAt: string | null;
  editedAt: string | null;
  createdAt: string;
  authorId: string;
  attachments: AttachmentView[];
}

export interface PostView {
  id: string;
  author: Author;
  authorId: string;
  body: string;
  videoUrl: string;
  pinnedAt: string | null;
  hiddenAt: string | null;
  editedAt: string | null;
  createdAt: string;
  attachments: AttachmentView[];
  comments: CommentView[];
}

export interface MessageView {
  id: string;
  studentId: string;
  author: Author;
  body: string;
  videoUrl: string;
  readAt: string | null;
  createdAt: string;
  attachments: AttachmentView[];
}

const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value ? String(value) : null);

type Row = Record<string, unknown>;

const authorOf = (row: Row): Author => ({
  id: String(row.author_id),
  name: String(row.author_name ?? ""),
  role: row.author_role as Author["role"],
});

const attachmentOf = (row: Row): AttachmentView => ({
  id: String(row.id),
  kind: row.kind as AttachmentKind,
  name: String(row.name),
  mime: String(row.mime),
  size: Number(row.size),
});

async function attachmentsFor(column: "post_id" | "comment_id" | "message_id", ids: string[]) {
  const map = new Map<string, AttachmentView[]>();
  if (ids.length === 0) return map;
  const rows = await query<Row>(
    `select id, ${column} as parent, kind, name, mime, size from public.community_attachments
      where ${column} = any($1::uuid[]) order by created_at, id`,
    [ids],
  );
  for (const row of rows) {
    const list = map.get(String(row.parent)) ?? [];
    list.push(attachmentOf(row));
    map.set(String(row.parent), list);
  }
  return map;
}

// The community -----------------------------------------------------------------------------------

export const PAGE_SIZE = 20;

/** Hidden items only for the owner and their own author; the same rule as canSeeItem. */
const VISIBLE = (alias: string) => `(${alias}.hidden_at is null or $1::boolean or ${alias}.author_id = $2)`;

export async function listPosts(viewer: Viewer, page = 1): Promise<{ posts: PostView[]; hasMore: boolean }> {
  if (!canUseCommunity(viewer)) return { posts: [], hasMore: false };
  const offset = (Math.max(1, page) - 1) * PAGE_SIZE;
  const rows = await query<Row>(
    `select p.*, u.name as author_name, u.role::text as author_role
       from public.community_posts p join public.users u on u.id = p.author_id
      where ${VISIBLE("p")}
      order by p.pinned_at desc nulls last, p.created_at desc
      limit $3 offset $4`,
    [isOwner(viewer), viewer.id, PAGE_SIZE + 1, offset],
  );
  const hasMore = rows.length > PAGE_SIZE;
  const posts = await withDetails(viewer, rows.slice(0, PAGE_SIZE));
  return { posts, hasMore };
}

export async function getPost(viewer: Viewer, postId: string): Promise<PostView | null> {
  if (!isUuid(postId) || !canUseCommunity(viewer)) return null;
  const rows = await query<Row>(
    `select p.*, u.name as author_name, u.role::text as author_role
       from public.community_posts p join public.users u on u.id = p.author_id
      where p.id = $3 and ${VISIBLE("p")}`,
    [isOwner(viewer), viewer.id, postId],
  );
  const [post] = await withDetails(viewer, rows);
  return post ?? null;
}

async function withDetails(viewer: Viewer, rows: Row[]): Promise<PostView[]> {
  const ids = rows.map((r) => String(r.id));
  if (ids.length === 0) return [];
  const commentRows = await query<Row>(
    `select c.*, u.name as author_name, u.role::text as author_role
       from public.community_comments c join public.users u on u.id = c.author_id
      where c.post_id = any($3::uuid[]) and ${VISIBLE("c")}
      order by c.created_at, c.id`,
    [isOwner(viewer), viewer.id, ids],
  );
  const [postFiles, commentFiles] = await Promise.all([
    attachmentsFor("post_id", ids),
    attachmentsFor("comment_id", commentRows.map((c) => String(c.id))),
  ]);
  const comments = new Map<string, CommentView[]>();
  for (const c of commentRows) {
    const view: CommentView = {
      id: String(c.id),
      postId: String(c.post_id),
      author: authorOf(c),
      authorId: String(c.author_id),
      body: String(c.body),
      hiddenAt: iso(c.hidden_at),
      editedAt: iso(c.edited_at),
      createdAt: iso(c.created_at)!,
      attachments: commentFiles.get(String(c.id)) ?? [],
    };
    const list = comments.get(view.postId) ?? [];
    list.push(view);
    comments.set(view.postId, list);
  }
  return rows.map((p) => ({
    id: String(p.id),
    author: authorOf(p),
    authorId: String(p.author_id),
    body: String(p.body),
    videoUrl: String(p.video_url ?? ""),
    pinnedAt: iso(p.pinned_at),
    hiddenAt: iso(p.hidden_at),
    editedAt: iso(p.edited_at),
    createdAt: iso(p.created_at)!,
    attachments: postFiles.get(String(p.id)) ?? [],
    comments: comments.get(String(p.id)) ?? [],
  }));
}

/** A post or comment as the rules need it (also hidden ones), or null. */
export async function findItem(kind: "post" | "comment", id: string, db?: Queryable) {
  if (!isUuid(id)) return null;
  const table = kind === "post" ? "public.community_posts" : "public.community_comments";
  const row = await one<Row>(`select * from ${table} where id = $1`, [id], db);
  if (!row) return null;
  return {
    id: String(row.id),
    authorId: String(row.author_id),
    hiddenAt: iso(row.hidden_at),
    postId: row.post_id ? String(row.post_id) : null,
  };
}

export interface ReportView {
  id: string;
  reason: string;
  createdAt: string;
  reporterName: string;
  postId: string;
  commentId: string | null;
  excerpt: string;
  authorName: string;
}

export async function openReports(viewer: Viewer): Promise<ReportView[]> {
  if (!isOwner(viewer)) return [];
  const rows = await query<Row>(
    `select r.id, r.reason, r.created_at, r.comment_id, coalesce(r.post_id, c.post_id) as post_id,
            ru.name as reporter_name, coalesce(c.body, p.body) as excerpt, au.name as author_name
       from public.community_reports r
       join public.users ru on ru.id = r.reporter_id
       left join public.community_comments c on c.id = r.comment_id
       left join public.community_posts p on p.id = coalesce(r.post_id, c.post_id)
       left join public.users au on au.id = coalesce(c.author_id, p.author_id)
      where r.resolved_at is null
      order by r.created_at desc`,
  );
  return rows.map((r) => ({
    id: String(r.id),
    reason: String(r.reason),
    createdAt: iso(r.created_at)!,
    reporterName: String(r.reporter_name),
    postId: String(r.post_id),
    commentId: r.comment_id ? String(r.comment_id) : null,
    excerpt: String(r.excerpt ?? ""),
    authorName: String(r.author_name ?? ""),
  }));
}

// Seen, unread and the per-person settings ---------------------------------------------------------

export interface Member {
  communitySeenAt: string | null;
  emailEnabled: boolean;
}

/** The person's row; made on first use, counting everything before it as already mailed. */
export async function member(userId: string, db?: Queryable): Promise<Member> {
  const row = await one<Row>(
    `insert into public.community_members (user_id, community_mailed_until, private_mailed_until)
     values ($1, now(), now())
     on conflict (user_id) do update set user_id = excluded.user_id
     returning community_seen_at, email_enabled`,
    [userId],
    db,
  );
  return { communitySeenAt: iso(row?.community_seen_at), emailEnabled: row?.email_enabled !== false };
}

export async function markCommunitySeen(userId: string) {
  await query(
    `insert into public.community_members (user_id, community_seen_at, community_mailed_until, private_mailed_until)
     values ($1, now(), now(), now())
     on conflict (user_id) do update set community_seen_at = now(), updated_at = now()`,
    [userId],
  );
}

export async function setEmailEnabled(userId: string, enabled: boolean) {
  await member(userId);
  await query(`update public.community_members set email_enabled = $2, updated_at = now() where user_id = $1`, [userId, enabled]);
}

/** New posts and comments by others since the last visit (hidden ones do not count). */
export async function unreadCommunity(viewer: Viewer): Promise<number> {
  if (!canUseCommunity(viewer)) return 0;
  const row = await one<{ n: string }>(
    `with seen as (select community_seen_at as at from public.community_members where user_id = $1)
     select (select count(*) from public.community_posts p
              where p.author_id <> $1 and p.hidden_at is null
                and p.created_at > coalesce((select at from seen), '-infinity'))
          + (select count(*) from public.community_comments c join public.community_posts p on p.id = c.post_id
              where c.author_id <> $1 and c.hidden_at is null and p.hidden_at is null
                and c.created_at > coalesce((select at from seen), '-infinity')) as n`,
    [viewer.id],
  );
  return Number(row?.n ?? 0);
}

/** Unread private messages: for a student from Sabine, for Sabine from all students together. */
export async function unreadPrivate(viewer: Viewer): Promise<number> {
  if (isOwner(viewer)) {
    const row = await one<{ n: string }>(
      `select count(*) as n from public.private_messages where author_id = student_id and read_at is null`,
    );
    return Number(row?.n ?? 0);
  }
  if (!canReadConversation(viewer, viewer.id)) return 0;
  const row = await one<{ n: string }>(
    `select count(*) as n from public.private_messages where student_id = $1 and author_id <> $1 and read_at is null`,
    [viewer.id],
  );
  return Number(row?.n ?? 0);
}

export async function openReportCount(viewer: Viewer): Promise<number> {
  if (!isOwner(viewer)) return 0;
  const row = await one<{ n: string }>(`select count(*) as n from public.community_reports where resolved_at is null`);
  return Number(row?.n ?? 0);
}

/** The counters for the menu; never stops a page when the tables are not there yet. */
export async function menuCounts(viewer: Viewer): Promise<{ community: number; private: number }> {
  try {
    const [community, privateCount, reports] = await Promise.all([unreadCommunity(viewer), unreadPrivate(viewer), openReportCount(viewer)]);
    return { community: community + reports, private: privateCount };
  } catch (err) {
    console.error(`[community] tellers: ${(err as Error).message}`);
    return { community: 0, private: 0 };
  }
}

// Private messages --------------------------------------------------------------------------------

export async function listMessages(viewer: Viewer, studentId: string): Promise<MessageView[]> {
  if (!isUuid(studentId) || !canReadConversation(viewer, studentId)) return [];
  const rows = await query<Row>(
    `select m.*, u.name as author_name, u.role::text as author_role
       from public.private_messages m join public.users u on u.id = m.author_id
      where m.student_id = $1 order by m.created_at, m.id`,
    [studentId],
  );
  const files = await attachmentsFor("message_id", rows.map((r) => String(r.id)));
  return rows.map((m) => ({
    id: String(m.id),
    studentId: String(m.student_id),
    author: authorOf(m),
    body: String(m.body),
    videoUrl: String(m.video_url ?? ""),
    readAt: iso(m.read_at),
    createdAt: iso(m.created_at)!,
    attachments: files.get(String(m.id)) ?? [],
  }));
}

export async function conversationHasMessages(studentId: string, db?: Queryable) {
  const row = await one(`select 1 from public.private_messages where student_id = $1 limit 1`, [studentId], db);
  return !!row;
}

/** Marks what the other side wrote as read. */
export async function markConversationRead(viewer: Viewer, studentId: string) {
  if (!canReadConversation(viewer, studentId)) return;
  await query(
    isOwner(viewer)
      ? `update public.private_messages set read_at = now() where student_id = $1 and author_id = student_id and read_at is null`
      : `update public.private_messages set read_at = now() where student_id = $1 and author_id <> student_id and read_at is null`,
    [studentId],
  );
}

export interface ConversationSummary {
  studentId: string;
  name: string;
  email: string;
  lastAt: string;
  lastFromStudent: boolean;
  lastBody: string;
  unread: number;
}

export async function listConversations(viewer: Viewer): Promise<ConversationSummary[]> {
  if (!isOwner(viewer)) return [];
  const rows = await query<Row>(
    `select distinct on (m.student_id) m.student_id, u.name, u.email, m.created_at, m.body, m.author_id = m.student_id as from_student,
            (select count(*) from public.private_messages x where x.student_id = m.student_id and x.author_id = x.student_id and x.read_at is null) as unread
       from public.private_messages m join public.users u on u.id = m.student_id
      order by m.student_id, m.created_at desc`,
  );
  return rows
    .map((r) => ({
      studentId: String(r.student_id),
      name: String(r.name),
      email: String(r.email),
      lastAt: iso(r.created_at)!,
      lastFromStudent: Boolean(r.from_student),
      lastBody: String(r.body),
      unread: Number(r.unread),
    }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

// Attachments -------------------------------------------------------------------------------------

/** One attachment with what decides who may see it. */
export async function attachmentWithParent(id: string) {
  if (!isUuid(id)) return null;
  const row = await one<Row>(
    `select a.*, p.author_id as post_author, p.hidden_at as post_hidden,
            c.author_id as comment_author, c.hidden_at as comment_hidden,
            cp.author_id as comment_post_author, cp.hidden_at as comment_post_hidden,
            m.student_id as message_student
       from public.community_attachments a
       left join public.community_posts p on p.id = a.post_id
       left join public.community_comments c on c.id = a.comment_id
       left join public.community_posts cp on cp.id = c.post_id
       left join public.private_messages m on m.id = a.message_id
      where a.id = $1`,
    [id],
  );
  if (!row) return null;
  const parent = row.post_id
    ? { kind: "post" as const, item: { authorId: String(row.post_author), hiddenAt: iso(row.post_hidden) } }
    : row.comment_id
      ? {
          kind: "comment" as const,
          item: { authorId: String(row.comment_author), hiddenAt: iso(row.comment_hidden) },
          post: { authorId: String(row.comment_post_author), hiddenAt: iso(row.comment_post_hidden) },
        }
      : row.message_id
        ? { kind: "message" as const, studentId: String(row.message_student) }
        : { kind: "unposted" as const, uploaderId: String(row.uploader_id) };
  return { fileId: String(row.file_id), name: String(row.name), mime: String(row.mime), parent };
}

/** Removes uploads for good: the rows (bytes in Postgres) and, with Supabase, the objects in the bucket. */
export async function removeFiles(fileIds: string[]) {
  const ids = fileIds.filter(isUuid);
  if (ids.length === 0) return;
  await query(`delete from public.files where id = any($1::uuid[])`, [ids]);
  if (supabaseEnabled()) {
    const { error } = await adminClient().storage.from(BUCKET).remove(ids);
    if (error) console.error(`[community] bestanden opruimen in Storage: ${error.message}`);
  }
}

/** The file ids under a post (its own and those of its comments), a comment or a set of attachments. */
export async function fileIdsOf(where: { postId?: string; commentId?: string; attachmentIds?: string[] }, db?: Queryable) {
  const rows = where.postId
    ? await query<{ file_id: string }>(
        `select a.file_id from public.community_attachments a
          where a.post_id = $1 or a.comment_id in (select id from public.community_comments where post_id = $1)`,
        [where.postId],
        db,
      )
    : where.commentId
      ? await query<{ file_id: string }>(`select file_id from public.community_attachments where comment_id = $1`, [where.commentId], db)
      : await query<{ file_id: string }>(`select file_id from public.community_attachments where id = any($1::uuid[])`, [where.attachmentIds ?? []], db);
  return rows.map((r) => r.file_id);
}

/** Uploads that were never posted, after a day. */
export async function removeUnpostedUploads() {
  const rows = await query<{ file_id: string }>(
    `select file_id from public.community_attachments
      where post_id is null and comment_id is null and message_id is null and created_at < now() - interval '1 day'`,
  );
  await removeFiles(rows.map((r) => r.file_id));
}

export { canSeeItem };
