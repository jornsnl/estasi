/**
 * The rules of the community and the private messages (Academy 14), free of
 * server imports so they are unit tested (tests/community.test.ts). The
 * server (src/lib/community/server.ts, src/app/actions/community.ts) asks
 * these functions before it shows or changes anything.
 *
 * Who may do what:
 * - The community: Sabine (role owner) and students whose access is active.
 *   Paused, expired or revoked access, no enrollment, and bridal couples
 *   (role couple): no community at all, also not read only.
 * - Private messages: one conversation per student, only that student and
 *   Sabine ever see it. A student whose access is not active (paused,
 *   expired, revoked) keeps reading it and may still answer Sabine, but
 *   cannot start a conversation that Sabine did not start. Couples: never.
 */

import type { AccessStatus } from "@/lib/domain/access";

export type ViewerRole = "student" | "owner" | "couple";

export interface Viewer {
  id: string;
  role: ViewerRole;
  /** The student's access; "none" without enrollment. Not used for the owner. */
  access: AccessStatus | "none";
}

export const isOwner = (viewer: Viewer) => viewer.role === "owner";

/** May open the community (read, post, comment). */
export function canUseCommunity(viewer: Viewer): boolean {
  if (viewer.role === "owner") return true;
  return viewer.role === "student" && viewer.access === "active";
}

/** May read the private conversation of this student. */
export function canReadConversation(viewer: Viewer, studentId: string): boolean {
  if (viewer.role === "owner") return true;
  return viewer.role === "student" && viewer.id === studentId && viewer.access !== "none";
}

/**
 * May write in the conversation of this student. A student without active
 * access may only answer: there must already be a message in the conversation.
 */
export function canWriteConversation(viewer: Viewer, studentId: string, conversationHasMessages: boolean): boolean {
  if (!canReadConversation(viewer, studentId)) return false;
  if (viewer.role === "owner") return true;
  return viewer.access === "active" || conversationHasMessages;
}

/** Posts and comments, as far as the rules need them. */
export interface Item {
  authorId: string;
  hiddenAt: string | null;
}

/** Hidden items stay visible to Sabine and to their author (with a note). */
export function canSeeItem(viewer: Viewer, item: Item): boolean {
  if (!canUseCommunity(viewer)) return false;
  return !item.hiddenAt || isOwner(viewer) || item.authorId === viewer.id;
}

/** Only the author edits, and not after Sabine hid it. */
export const canEditItem = (viewer: Viewer, item: Item) =>
  canUseCommunity(viewer) && item.authorId === viewer.id && !item.hiddenAt;

export const canDeleteItem = (viewer: Viewer, item: Item) =>
  canUseCommunity(viewer) && (isOwner(viewer) || item.authorId === viewer.id);

/** Hide, show again, pin: Sabine only. */
export const canModerate = (viewer: Viewer) => isOwner(viewer);

/** A student reports someone else's visible post or comment to Sabine. */
export const canReport = (viewer: Viewer, item: Item) =>
  viewer.role === "student" && canUseCommunity(viewer) && item.authorId !== viewer.id && !item.hiddenAt;

/** Comments only under a post that is not hidden. */
export const canComment = (viewer: Viewer, post: Item) => canUseCommunity(viewer) && !post.hiddenAt;

/** An attachment is visible exactly when its post, comment or conversation is. */
export type AttachmentParent =
  | { kind: "post"; item: Item }
  | { kind: "comment"; item: Item; post: Item }
  | { kind: "message"; studentId: string }
  | { kind: "unposted"; uploaderId: string };

export function canSeeAttachment(viewer: Viewer, parent: AttachmentParent): boolean {
  switch (parent.kind) {
    case "post":
      return canSeeItem(viewer, parent.item);
    case "comment":
      return canSeeItem(viewer, parent.post) && canSeeItem(viewer, parent.item);
    case "message":
      return canReadConversation(viewer, parent.studentId);
    case "unposted":
      // Only the uploader, for the preview before posting.
      return parent.uploaderId === viewer.id;
  }
}

// Text -------------------------------------------------------------------------------------------

export const LIMITS = { post: 5000, comment: 2000, message: 5000, report: 500 } as const;

/**
 * User text is stored and shown as plain text: never HTML. Control characters
 * (except new lines and tabs) go, line endings become \n, at most two empty
 * lines in a row, trimmed and cut to the limit.
 */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, max);
}

export type Segment = { type: "text"; text: string } | { type: "link"; text: string; href: string };

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

/**
 * Splits plain text into text and links, so the page can render links as
 * <a> and everything else as text (React escapes it). Only http(s) links;
 * a trailing full stop, comma or closing bracket stays outside the link.
 */
export function linkify(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    let raw = match[0];
    const trailing = raw.match(/[.,;:!?)\]]+$/);
    if (trailing) {
      // Keep a closing bracket that belongs to the link, as in wikipedia.org/wiki/X_(Y).
      let cut = trailing[0];
      if (cut.startsWith(")") && raw.slice(0, -cut.length).includes("(")) cut = cut.slice(1);
      raw = raw.slice(0, raw.length - cut.length);
    }
    const start = match.index ?? 0;
    const href = raw.toLowerCase().startsWith("www.") ? `https://${raw}` : raw;
    let valid = false;
    try {
      const url = new URL(href);
      valid = (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
    } catch {
      valid = false;
    }
    if (!valid) continue;
    if (start > last) segments.push({ type: "text", text: text.slice(last, start) });
    segments.push({ type: "link", text: raw, href });
    last = start + raw.length;
  }
  if (last < text.length) segments.push({ type: "text", text: text.slice(last) });
  return segments;
}

/**
 * A YouTube or Vimeo link turned into the address of its embedded player, or
 * null for anything else (no other sites, no direct video files).
 */
export function videoEmbed(url: string): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const safeId = (id: string | null | undefined) => (id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null);
  if (host === "youtube.com" || host === "m.youtube.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    const id = safeId(
      u.searchParams.get("v") ?? (["shorts", "embed", "live"].includes(parts[0] ?? "") ? parts[1] : null),
    );
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "youtu.be") {
    const id = safeId(u.pathname.split("/").filter(Boolean)[0]);
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    const index = host === "player.vimeo.com" ? parts.indexOf("video") + 1 : 0;
    const id = parts[index];
    if (!id || !/^\d{4,12}$/.test(id)) return null;
    // Unlisted videos carry a hash: vimeo.com/123/abc or ?h=abc.
    const hash = u.searchParams.get("h") ?? (host === "vimeo.com" && parts[1] && /^[0-9a-f]{6,20}$/i.test(parts[1]) ? parts[1] : null);
    return `https://player.vimeo.com/video/${id}?dnt=1${hash && /^[0-9a-f]{6,20}$/i.test(hash) ? `&h=${hash}` : ""}`;
  }
  return null;
}

// Uploads ----------------------------------------------------------------------------------------

const MB = 1024 * 1024;

/**
 * Within the existing Academy upload limit (10 MB per file, the form limit of
 * the server). Photos are made smaller in the browser first (as in Your
 * Wedding Space), so they are far below it. Videos are never uploaded: they
 * go as a YouTube or Vimeo link. "video" stays a kind only so attachments
 * uploaded before that rule still show.
 */
export const ATTACHMENT_RULES = {
  image: { extensions: ["jpg", "jpeg", "png", "webp", "gif"], maxBytes: 10 * MB, label: "foto" },
  video: { extensions: ["mp4", "webm", "mov"], maxBytes: 10 * MB, label: "video" },
  file: { extensions: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt"], maxBytes: 10 * MB, label: "bestand" },
} as const;

export type AttachmentKind = keyof typeof ATTACHMENT_RULES;

export const MAX_ATTACHMENTS = 6;

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
};

/** Kinds that can still be uploaded. */
const UPLOADABLE: AttachmentKind[] = ["image", "file"];

export const ACCEPT_ATTACHMENTS = UPLOADABLE.map((k) => ATTACHMENT_RULES[k])
  .flatMap((r) => r.extensions)
  .map((e) => `.${e}`)
  .join(",");

const extensionOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

/**
 * What an uploaded file is, decided by its extension (never by what the
 * browser claims), or the message to show.
 */
export function classifyAttachment(name: string, size: number): { ok: true; kind: AttachmentKind; mime: string } | { ok: false; error: string } {
  const ext = extensionOf(name);
  const kind = (Object.keys(ATTACHMENT_RULES) as AttachmentKind[]).find((k) =>
    (ATTACHMENT_RULES[k].extensions as readonly string[]).includes(ext),
  );
  if (!kind) return { ok: false, error: ext ? `Bestandstype .${ext} kan niet in de community.` : "Dit bestand heeft geen herkenbaar type." };
  if (kind === "video") return { ok: false, error: "Video's kun je niet uploaden. Zet de video op YouTube of Vimeo en plak de link bij Video." };
  if (size <= 0) return { ok: false, error: "Dit bestand is leeg." };
  const rules = ATTACHMENT_RULES[kind];
  if (size > rules.maxBytes) {
    return {
      ok: false,
      error: `Dit ${rules.label} is groter dan 10 MB.`,
    };
  }
  return { ok: true, kind, mime: MIME[ext] };
}

/** Only images, short videos and PDFs open in the browser; everything else downloads. */
export const opensInline = (mime: string) => /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime)|application\/pdf)$/.test(mime);

// Notifications ----------------------------------------------------------------------------------

const MINUTE = 60_000;

/**
 * At most one mail per person per window: community news is bundled per
 * hour, private messages per quarter of an hour. The first news after a
 * quiet window goes out at once; what follows inside the window waits for
 * the next mail.
 */
export const MAIL_WINDOWS = { community: 60 * MINUTE, private: 15 * MINUTE } as const;

export type MailChannel = keyof typeof MAIL_WINDOWS;

export function mailDue(input: { channel: MailChannel; lastMailedAt: string | null; newItems: number; now: Date }): boolean {
  if (input.newItems <= 0) return false;
  if (!input.lastMailedAt) return true;
  return input.now.getTime() - new Date(input.lastMailedAt).getTime() >= MAIL_WINDOWS[input.channel];
}

/** When the next mail may go out for someone who has news waiting. */
export function nextMailAt(channel: MailChannel, lastMailedAt: string | null, now: Date): Date {
  if (!lastMailedAt) return now;
  const at = new Date(new Date(lastMailedAt).getTime() + MAIL_WINDOWS[channel]);
  return at > now ? at : now;
}

/**
 * The moment from which news counts as unmailed: whatever came after both
 * the last mail and the last visit. Seen items are never mailed.
 */
export function newsSince(...moments: (string | null | undefined)[]): string {
  const times = moments.filter((m): m is string => !!m).map((m) => new Date(m).getTime());
  return new Date(times.length ? Math.max(...times) : 0).toISOString();
}

/** Push for the community: at most one per person per hour. Private messages always push. */
export const COMMUNITY_PUSH_WINDOW = 60 * MINUTE;

export const pushDue = (lastPushedAt: string | null, now: Date) =>
  !lastPushedAt || now.getTime() - new Date(lastPushedAt).getTime() >= COMMUNITY_PUSH_WINDOW;

/** Short preview of a post or comment for a mail: one line, at most `max` characters. */
export function preview(text: string, max = 140): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** "3" or "9+" for the menu. */
export const badgeText = (count: number) => (count > 9 ? "9+" : String(count));
