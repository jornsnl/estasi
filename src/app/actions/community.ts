"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { isUuid, one, query, tx } from "@/lib/db";
import { getFiles } from "@/lib/data";
import { audit } from "@/lib/academy";
import {
  canComment,
  canDeleteItem,
  canEditItem,
  canModerate,
  canReport,
  canSeeItem,
  canUseCommunity,
  canWriteConversation,
  classifyAttachment,
  cleanText,
  isOwner,
  LIMITS,
  MAX_ATTACHMENTS,
  videoEmbed,
  type Viewer,
} from "@/lib/community/rules";
import {
  communityPath,
  conversationHasMessages,
  conversationPath,
  fileIdsOf,
  findItem,
  removeFiles,
  requireViewer,
  setEmailEnabled,
  type AttachmentView,
} from "@/lib/community/server";
import { notifyReport, processNotifications, pushCommunity, pushPrivate } from "@/lib/community/notify";

/**
 * Everything that changes the community or the private messages. Each action
 * first loads the viewer and asks the rules (src/lib/community/rules.ts).
 */

type Result = { ok: true; attachment: AttachmentView } | { ok: false; error: string };

function back(path: string, message: string, options: { error?: boolean; anchor?: string } = {}): never {
  const key = options.error ? "fout" : "melding";
  redirect(`${path}?${key}=${encodeURIComponent(message)}${options.anchor ? `#${options.anchor}` : ""}`);
}

const text = (formData: FormData, name: string, max: number) => cleanText(formData.get(name), max);

/** The video link field: empty, or a YouTube/Vimeo link. */
function videoField(formData: FormData): { url: string } | { error: string } {
  const raw = String(formData.get("videoUrl") ?? "").trim().slice(0, 500);
  if (!raw) return { url: "" };
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return videoEmbed(url) ? { url } : { error: "Die videolink werkt niet. Plak een link van YouTube of Vimeo." };
}

const attachmentIds = (formData: FormData) =>
  [...new Set(formData.getAll("attachments").map(String).filter(isUuid))].slice(0, MAX_ATTACHMENTS);

/** Notifications run after the response, so posting never waits for mail or push. */
function notifyLater(work: () => Promise<unknown>) {
  after(async () => {
    try {
      await work();
      await processNotifications();
    } catch (err) {
      console.error(`[community] melding versturen: ${(err as Error).message}`);
    }
  });
}

// Uploads -----------------------------------------------------------------------------------------

/**
 * One file, sent on its own from the browser before the post or message is
 * placed (so each file has the full upload limit). Kept as "not posted"
 * until the form that uses it is sent; `conversation` is the student id for
 * a private message, empty for the community.
 */
export async function uploadCommunityFile(formData: FormData): Promise<Result> {
  const viewer = await requireViewer();
  const conversation = String(formData.get("conversation") ?? "");
  if (conversation) {
    if (!isUuid(conversation) || !canWriteConversation(viewer, conversation, await conversationHasMessages(conversation))) {
      return { ok: false, error: "Je kunt hier geen bestand sturen." };
    }
  } else if (!canUseCommunity(viewer)) {
    return { ok: false, error: "Je hebt op dit moment geen toegang tot de community." };
  }
  const file = formData.get("file");
  if (!file || typeof file === "string") return { ok: false, error: "Kies een bestand." };
  const kind = classifyAttachment(file.name, file.size);
  if (!kind.ok) return { ok: false, error: kind.error };
  const waiting = await one<{ n: string }>(
    `select count(*) as n from public.community_attachments
      where uploader_id = $1 and post_id is null and comment_id is null and message_id is null`,
    [viewer.id],
  );
  if (Number(waiting?.n ?? 0) >= 30) return { ok: false, error: "Je hebt al veel bestanden klaarstaan. Plaats eerst je bericht." };

  const name = file.name.replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || "bestand";
  // belongs_to: the uploader, or the student of the conversation. The general file route
  // (/api/bestanden) then never shows it to other students; they use /api/community/bestanden.
  const stored = await getFiles().save(Buffer.from(await file.arrayBuffer()), {
    name,
    mime: kind.mime,
    belongsTo: conversation || viewer.id,
    uploadedBy: viewer.id,
  });
  const row = await one<{ id: string }>(
    `insert into public.community_attachments (file_id, uploader_id, conversation_id, kind, name, mime, size)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [stored.id, viewer.id, conversation || null, kind.kind, name, kind.mime, stored.size],
  );
  return { ok: true, attachment: { id: row!.id, kind: kind.kind, name, mime: kind.mime, size: stored.size } };
}

/** Links the uploads of this person to the new item; only uploads meant for this place. */
async function attach(
  client: Parameters<Parameters<typeof tx>[0]>[0],
  viewer: Viewer,
  ids: string[],
  target: { column: "post_id" | "comment_id" | "message_id"; id: string; conversation: string | null },
) {
  if (ids.length === 0) return 0;
  const rows = await query(
    `update public.community_attachments set ${target.column} = $1
      where id = any($2::uuid[]) and uploader_id = $3 and post_id is null and comment_id is null and message_id is null
        and conversation_id is not distinct from $4
      returning id`,
    [target.id, ids, viewer.id, target.conversation],
    client,
  );
  return rows.length;
}

// Posts -------------------------------------------------------------------------------------------

export async function createPost(formData: FormData) {
  const viewer = await requireViewer();
  const path = communityPath(viewer);
  if (!canUseCommunity(viewer)) back(path, "Je hebt op dit moment geen toegang tot de community.", { error: true });
  const body = text(formData, "body", LIMITS.post);
  const video = videoField(formData);
  if ("error" in video) back(path, video.error, { error: true });
  const ids = attachmentIds(formData);
  if (!body && !video.url && ids.length === 0) back(path, "Schrijf iets of voeg een foto, video of bestand toe.", { error: true });

  const postId = await tx(async (client) => {
    const row = await one<{ id: string }>(
      `insert into public.community_posts (author_id, body, video_url) values ($1, $2, $3) returning id`,
      [viewer.id, body, video.url],
      client,
    );
    await attach(client, viewer, ids, { column: "post_id", id: row!.id, conversation: null });
    return row!.id;
  });
  notifyLater(() => pushCommunity(viewer.id, viewer.user.name, "post"));
  back(path, "Je bericht staat in de community.", { anchor: `bericht-${postId}` });
}

export async function updatePost(formData: FormData) {
  const viewer = await requireViewer();
  const path = communityPath(viewer);
  const id = String(formData.get("postId") ?? "");
  const post = await findItem("post", id);
  if (!post || !canEditItem(viewer, post)) back(path, "Dit bericht kun je niet bewerken.", { error: true });
  const body = text(formData, "body", LIMITS.post);
  const video = videoField(formData);
  if ("error" in video) back(path, video.error, { error: true, anchor: `bericht-${id}` });

  const remove = formData.getAll("removeAttachment").map(String).filter(isUuid);
  const own = remove.length
    ? await query<{ id: string; file_id: string }>(`select id, file_id from public.community_attachments where post_id = $1 and id = any($2::uuid[])`, [id, remove])
    : [];
  const remaining = await one<{ n: string }>(`select count(*) as n from public.community_attachments where post_id = $1`, [id]);
  if (!body && !video.url && Number(remaining?.n ?? 0) - own.length <= 0) {
    back(path, "Een leeg bericht kan niet. Verwijder het bericht als je het weg wilt hebben.", { error: true, anchor: `bericht-${id}` });
  }
  await query(`update public.community_posts set body = $2, video_url = $3, edited_at = now() where id = $1`, [id, body, video.url]);
  if (own.length) {
    await query(`delete from public.community_attachments where id = any($1::uuid[])`, [own.map((a) => a.id)]);
    await removeFiles(own.map((a) => a.file_id));
  }
  back(path, "Je bericht is aangepast.", { anchor: `bericht-${id}` });
}

export async function deletePost(formData: FormData) {
  const viewer = await requireViewer();
  const path = communityPath(viewer);
  const id = String(formData.get("postId") ?? "");
  const post = await findItem("post", id);
  if (!post || !canDeleteItem(viewer, post)) back(path, "Dit bericht kun je niet verwijderen.", { error: true });
  const files = await fileIdsOf({ postId: id });
  await query(`delete from public.community_posts where id = $1`, [id]);
  await removeFiles(files);
  if (isOwner(viewer) && post.authorId !== viewer.id) await audit(viewer.user, "Community: bericht verwijderd", "", post.authorId);
  back(path, "Het bericht is verwijderd.");
}

export async function setPostHidden(formData: FormData) {
  const viewer = await requireViewer();
  const path = communityPath(viewer);
  const id = String(formData.get("postId") ?? "");
  const post = await findItem("post", id);
  if (!post || !canModerate(viewer)) back(path, "Alleen Sabine kan berichten verbergen.", { error: true });
  const hide = formData.get("hide") === "1";
  await query(`update public.community_posts set hidden_at = ${hide ? "now()" : "null"} where id = $1`, [id]);
  if (hide) await query(`update public.community_reports set resolved_at = now() where post_id = $1 and resolved_at is null`, [id]);
  await audit(viewer.user, hide ? "Community: bericht verborgen" : "Community: bericht weer zichtbaar", "", post.authorId);
  back(path, hide ? "Het bericht is verborgen voor cursisten." : "Het bericht is weer zichtbaar.", { anchor: `bericht-${id}` });
}

export async function setPostPinned(formData: FormData) {
  const viewer = await requireViewer();
  const path = communityPath(viewer);
  const id = String(formData.get("postId") ?? "");
  const post = await findItem("post", id);
  if (!post || !canModerate(viewer)) back(path, "Alleen Sabine kan berichten vastpinnen.", { error: true });
  const pin = formData.get("pin") === "1";
  await query(`update public.community_posts set pinned_at = ${pin ? "now()" : "null"} where id = $1`, [id]);
  back(path, pin ? "Het bericht staat nu bovenaan." : "Het bericht is losgemaakt.", { anchor: `bericht-${id}` });
}

// Comments ----------------------------------------------------------------------------------------

export async function createComment(formData: FormData) {
  const viewer = await requireViewer();
  const path = communityPath(viewer);
  const postId = String(formData.get("postId") ?? "");
  const post = await findItem("post", postId);
  if (!post || !canSeeItem(viewer, post) || !canComment(viewer, post)) back(path, "Op dit bericht kun je niet reageren.", { error: true });
  const body = text(formData, "body", LIMITS.comment);
  const ids = attachmentIds(formData);
  if (!body && ids.length === 0) back(path, "Schrijf eerst een reactie.", { error: true, anchor: `bericht-${postId}` });
  const commentId = await tx(async (client) => {
    const row = await one<{ id: string }>(
      `insert into public.community_comments (post_id, author_id, body) values ($1, $2, $3) returning id`,
      [postId, viewer.id, body],
      client,
    );
    await attach(client, viewer, ids, { column: "comment_id", id: row!.id, conversation: null });
    return row!.id;
  });
  notifyLater(() => pushCommunity(viewer.id, viewer.user.name, "comment"));
  back(path, "Je reactie is geplaatst.", { anchor: `reactie-${commentId}` });
}

export async function updateComment(formData: FormData) {
  const viewer = await requireViewer();
  const path = communityPath(viewer);
  const id = String(formData.get("commentId") ?? "");
  const comment = await findItem("comment", id);
  if (!comment || !canEditItem(viewer, comment)) back(path, "Deze reactie kun je niet bewerken.", { error: true });
  const body = text(formData, "body", LIMITS.comment);
  if (!body) back(path, "Een lege reactie kan niet. Verwijder hem als je hem weg wilt hebben.", { error: true, anchor: `reactie-${id}` });
  await query(`update public.community_comments set body = $2, edited_at = now() where id = $1`, [id, body]);
  back(path, "Je reactie is aangepast.", { anchor: `reactie-${id}` });
}

export async function deleteComment(formData: FormData) {
  const viewer = await requireViewer();
  const path = communityPath(viewer);
  const id = String(formData.get("commentId") ?? "");
  const comment = await findItem("comment", id);
  if (!comment || !canDeleteItem(viewer, comment)) back(path, "Deze reactie kun je niet verwijderen.", { error: true });
  const files = await fileIdsOf({ commentId: id });
  await query(`delete from public.community_comments where id = $1`, [id]);
  await removeFiles(files);
  if (isOwner(viewer) && comment.authorId !== viewer.id) await audit(viewer.user, "Community: reactie verwijderd", "", comment.authorId);
  back(path, "De reactie is verwijderd.", { anchor: comment.postId ? `bericht-${comment.postId}` : undefined });
}

export async function setCommentHidden(formData: FormData) {
  const viewer = await requireViewer();
  const path = communityPath(viewer);
  const id = String(formData.get("commentId") ?? "");
  const comment = await findItem("comment", id);
  if (!comment || !canModerate(viewer)) back(path, "Alleen Sabine kan reacties verbergen.", { error: true });
  const hide = formData.get("hide") === "1";
  await query(`update public.community_comments set hidden_at = ${hide ? "now()" : "null"} where id = $1`, [id]);
  if (hide) await query(`update public.community_reports set resolved_at = now() where comment_id = $1 and resolved_at is null`, [id]);
  await audit(viewer.user, hide ? "Community: reactie verborgen" : "Community: reactie weer zichtbaar", "", comment.authorId);
  back(path, hide ? "De reactie is verborgen voor cursisten." : "De reactie is weer zichtbaar.", { anchor: `reactie-${id}` });
}

// Reports -----------------------------------------------------------------------------------------

export async function reportItem(formData: FormData) {
  const viewer = await requireViewer();
  const path = communityPath(viewer);
  const kind = formData.get("kind") === "comment" ? "comment" : "post";
  const id = String(formData.get("id") ?? "");
  const item = await findItem(kind, id);
  if (!item || !canSeeItem(viewer, item) || !canReport(viewer, item)) back(path, "Dit kun je niet melden.", { error: true });
  const reason = text(formData, "reason", LIMITS.report);
  const already = await one(
    `select 1 from public.community_reports where reporter_id = $1 and ${kind === "post" ? "post_id" : "comment_id"} = $2 and resolved_at is null`,
    [viewer.id, id],
  );
  if (!already) {
    await query(`insert into public.community_reports (${kind === "post" ? "post_id" : "comment_id"}, reporter_id, reason) values ($1, $2, $3)`, [
      id,
      viewer.id,
      reason,
    ]);
    const excerpt = await one<{ body: string }>(
      `select body from ${kind === "post" ? "public.community_posts" : "public.community_comments"} where id = $1`,
      [id],
    );
    after(() => notifyReport(viewer.user.name, excerpt?.body ?? "").catch((err) => console.error(`[community] melding: ${(err as Error).message}`)));
  }
  back(path, "Bedankt, Sabine heeft je melding gekregen en kijkt ernaar.", { anchor: kind === "post" ? `bericht-${id}` : `reactie-${id}` });
}

export async function resolveReport(formData: FormData) {
  const viewer = await requireViewer();
  const path = communityPath(viewer);
  if (!canModerate(viewer)) back(path, "Alleen Sabine kan meldingen afhandelen.", { error: true });
  const id = String(formData.get("reportId") ?? "");
  if (isUuid(id)) await query(`update public.community_reports set resolved_at = now() where id = $1`, [id]);
  back(path, "De melding is afgehandeld.");
}

// Private messages --------------------------------------------------------------------------------

export async function sendPrivateMessage(formData: FormData) {
  const viewer = await requireViewer();
  // A student always writes in the own conversation; Sabine names the student.
  const studentId = isOwner(viewer) ? String(formData.get("studentId") ?? "") : viewer.id;
  if (!isUuid(studentId)) back("/beheer/berichten", "Kies een cursist.", { error: true });
  const path = conversationPath(viewer, studentId);
  if (isOwner(viewer)) {
    const student = await one(`select 1 from public.users where id = $1 and role::text = 'student'`, [studentId]);
    if (!student) back("/beheer/berichten", "Deze cursist bestaat niet.", { error: true });
  }
  if (!canWriteConversation(viewer, studentId, await conversationHasMessages(studentId))) {
    back(path, "Je kunt op dit moment geen nieuw gesprek beginnen.", { error: true });
  }
  const body = text(formData, "body", LIMITS.message);
  const video = videoField(formData);
  if ("error" in video) back(path, video.error, { error: true });
  const ids = attachmentIds(formData);
  if (!body && !video.url && ids.length === 0) back(path, "Schrijf eerst een bericht.", { error: true });
  const messageId = await tx(async (client) => {
    const row = await one<{ id: string }>(
      `insert into public.private_messages (student_id, author_id, body, video_url) values ($1, $2, $3, $4) returning id`,
      [studentId, viewer.id, body, video.url],
      client,
    );
    await attach(client, viewer, ids, { column: "message_id", id: row!.id, conversation: studentId });
    // Answering means the other side's messages were read.
    await query(
      isOwner(viewer)
        ? `update public.private_messages set read_at = now() where student_id = $1 and author_id = student_id and read_at is null`
        : `update public.private_messages set read_at = now() where student_id = $1 and author_id <> student_id and read_at is null`,
      [studentId],
      client,
    );
    return row!.id;
  });
  notifyLater(() => pushPrivate(studentId, isOwner(viewer), viewer.user.name));
  back(path, "Je bericht is verstuurd.", { anchor: `pb-${messageId}` });
}

// Settings ----------------------------------------------------------------------------------------

export async function saveNotificationSettings(formData: FormData) {
  const viewer = await requireViewer();
  await setEmailEnabled(viewer.id, formData.get("email") === "on");
  const path = isOwner(viewer) ? "/beheer/profiel" : "/profiel";
  back(path, formData.get("email") === "on" ? "Je krijgt meldingen per e-mail." : "Je krijgt geen meldingen meer per e-mail.", { anchor: "meldingen" });
}

export async function savePushSubscription(input: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string }) {
  const viewer = await requireViewer();
  const endpoint = String(input?.endpoint ?? "");
  const p256dh = String(input?.keys?.p256dh ?? "");
  const auth = String(input?.keys?.auth ?? "");
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
    return { ok: false as const };
  }
  await query(
    `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) values ($1, $2, $3, $4, $5)
     on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
       user_agent = excluded.user_agent`,
    [viewer.id, endpoint, p256dh, auth, String(input.userAgent ?? "").slice(0, 300)],
  );
  return { ok: true as const };
}

export async function removePushSubscription(endpoint: string) {
  const viewer = await requireViewer();
  await query(`delete from public.push_subscriptions where endpoint = $1 and user_id = $2`, [String(endpoint ?? ""), viewer.id]);
  return { ok: true as const };
}
