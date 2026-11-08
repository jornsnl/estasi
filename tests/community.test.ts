import { describe, expect, it } from "vitest";
import {
  badgeText,
  canComment,
  canDeleteItem,
  canEditItem,
  canModerate,
  canReadConversation,
  canReport,
  canSeeAttachment,
  canSeeItem,
  canUseCommunity,
  canWriteConversation,
  classifyAttachment,
  cleanText,
  linkify,
  mailDue,
  newsSince,
  nextMailAt,
  opensInline,
  preview,
  pushDue,
  videoEmbed,
  type Viewer,
} from "@/lib/community/rules";

const owner: Viewer = { id: "sabine", role: "owner", access: "active" };
const lotte: Viewer = { id: "lotte", role: "student", access: "active" };
const noor: Viewer = { id: "noor", role: "student", access: "active" };
const eva: Viewer = { id: "eva", role: "student", access: "expired" };
const paused: Viewer = { id: "pim", role: "student", access: "paused" };
const revoked: Viewer = { id: "rik", role: "student", access: "revoked" };
const none: Viewer = { id: "nina", role: "student", access: "none" };
const couple: Viewer = { id: "paar", role: "couple", access: "active" };

const post = (authorId: string, hiddenAt: string | null = null) => ({ authorId, hiddenAt });

describe("community: who may enter", () => {
  it("Sabine and students with active access only", () => {
    expect(canUseCommunity(owner)).toBe(true);
    expect(canUseCommunity(lotte)).toBe(true);
    for (const v of [eva, paused, revoked, none, couple]) expect(canUseCommunity(v)).toBe(false);
  });

  it("nobody outside sees any post, also not their own", () => {
    expect(canSeeItem(eva, post("eva"))).toBe(false);
    expect(canSeeItem(couple, post("lotte"))).toBe(false);
  });
});

describe("community: posts and comments", () => {
  it("hidden items: only Sabine and the author", () => {
    const hidden = post("lotte", "2026-11-01T10:00:00Z");
    expect(canSeeItem(owner, hidden)).toBe(true);
    expect(canSeeItem(lotte, hidden)).toBe(true);
    expect(canSeeItem(noor, hidden)).toBe(false);
    expect(canSeeItem(noor, post("lotte"))).toBe(true);
  });

  it("only the author edits, not after hiding; author and Sabine delete", () => {
    expect(canEditItem(lotte, post("lotte"))).toBe(true);
    expect(canEditItem(lotte, post("lotte", "2026-11-01T10:00:00Z"))).toBe(false);
    expect(canEditItem(owner, post("lotte"))).toBe(false);
    expect(canEditItem(noor, post("lotte"))).toBe(false);
    expect(canDeleteItem(lotte, post("lotte"))).toBe(true);
    expect(canDeleteItem(owner, post("lotte"))).toBe(true);
    expect(canDeleteItem(noor, post("lotte"))).toBe(false);
    // Lost access: the own post cannot be changed from outside the community either.
    expect(canDeleteItem(eva, post("eva"))).toBe(false);
  });

  it("moderating is for Sabine; reporting for other students", () => {
    expect(canModerate(owner)).toBe(true);
    expect(canModerate(lotte)).toBe(false);
    expect(canReport(noor, post("lotte"))).toBe(true);
    expect(canReport(lotte, post("lotte"))).toBe(false);
    expect(canReport(owner, post("lotte"))).toBe(false);
    expect(canReport(noor, post("lotte", "2026-11-01T10:00:00Z"))).toBe(false);
  });

  it("no comments under a hidden post", () => {
    expect(canComment(noor, post("lotte"))).toBe(true);
    expect(canComment(owner, post("lotte", "2026-11-01T10:00:00Z"))).toBe(false);
    expect(canComment(eva, post("lotte"))).toBe(false);
  });
});

describe("private messages", () => {
  it("only the student of the conversation and Sabine", () => {
    expect(canReadConversation(owner, "lotte")).toBe(true);
    expect(canReadConversation(lotte, "lotte")).toBe(true);
    expect(canReadConversation(noor, "lotte")).toBe(false);
    expect(canReadConversation(couple, "paar")).toBe(false);
    expect(canReadConversation(none, "nina")).toBe(false);
  });

  it("without active access: read and answer, but not start", () => {
    for (const v of [eva, paused, revoked]) {
      expect(canReadConversation(v, v.id)).toBe(true);
      expect(canWriteConversation(v, v.id, false)).toBe(false);
      expect(canWriteConversation(v, v.id, true)).toBe(true);
    }
    expect(canWriteConversation(lotte, "lotte", false)).toBe(true);
    expect(canWriteConversation(owner, "eva", false)).toBe(true);
    expect(canWriteConversation(noor, "lotte", true)).toBe(false);
  });
});

describe("attachments follow their parent", () => {
  it("post, comment, message and unposted uploads", () => {
    const hidden = post("lotte", "2026-11-01T10:00:00Z");
    expect(canSeeAttachment(noor, { kind: "post", item: post("lotte") })).toBe(true);
    expect(canSeeAttachment(noor, { kind: "post", item: hidden })).toBe(false);
    expect(canSeeAttachment(eva, { kind: "post", item: post("lotte") })).toBe(false);
    expect(canSeeAttachment(noor, { kind: "comment", item: post("noor"), post: hidden })).toBe(false);
    expect(canSeeAttachment(noor, { kind: "comment", item: post("lotte"), post: post("lotte") })).toBe(true);
    expect(canSeeAttachment(noor, { kind: "message", studentId: "lotte" })).toBe(false);
    expect(canSeeAttachment(lotte, { kind: "message", studentId: "lotte" })).toBe(true);
    expect(canSeeAttachment(owner, { kind: "message", studentId: "lotte" })).toBe(true);
    expect(canSeeAttachment(eva, { kind: "message", studentId: "eva" })).toBe(true);
    expect(canSeeAttachment(couple, { kind: "message", studentId: "lotte" })).toBe(false);
    expect(canSeeAttachment(noor, { kind: "unposted", uploaderId: "lotte" })).toBe(false);
    expect(canSeeAttachment(lotte, { kind: "unposted", uploaderId: "lotte" })).toBe(true);
  });

  it("type by extension and the 10 MB limit", () => {
    expect(classifyAttachment("foto.JPG", 1000)).toEqual({ ok: true, kind: "image", mime: "image/jpeg" });
    expect(classifyAttachment("clip.mp4", 5_000_000)).toMatchObject({ ok: true, kind: "video" });
    expect(classifyAttachment("plan.docx", 1000)).toMatchObject({ ok: true, kind: "file" });
    expect(classifyAttachment("lang.mp4", 11 * 1024 * 1024)).toMatchObject({ ok: false });
    expect(classifyAttachment("script.html", 10)).toMatchObject({ ok: false });
    expect(classifyAttachment("geen-type", 10)).toMatchObject({ ok: false });
    expect(classifyAttachment("leeg.pdf", 0)).toMatchObject({ ok: false });
    expect(opensInline("image/png")).toBe(true);
    expect(opensInline("image/svg+xml")).toBe(false);
    expect(opensInline("text/html")).toBe(false);
  });
});

describe("text", () => {
  it("cleans control characters and keeps it plain", () => {
    expect(cleanText("  hoi\r\ndaar\u0000‮  ", 100)).toBe("hoi\ndaar");
    expect(cleanText("a\n\n\n\n\n\nb", 100)).toBe("a\n\n\nb");
    expect(cleanText("<b>vet</b>", 100)).toBe("<b>vet</b>");
    expect(cleanText("x".repeat(20), 5)).toBe("xxxxx");
    expect(cleanText(42, 5)).toBe("");
  });

  it("makes http(s) links clickable, nothing else", () => {
    expect(linkify("Kijk op https://estasi.nl/academy. Leuk!")).toEqual([
      { type: "text", text: "Kijk op " },
      { type: "link", text: "https://estasi.nl/academy", href: "https://estasi.nl/academy" },
      { type: "text", text: ". Leuk!" },
    ]);
    expect(linkify("(zie www.voorbeeld.nl)")).toEqual([
      { type: "text", text: "(zie " },
      { type: "link", text: "www.voorbeeld.nl", href: "https://www.voorbeeld.nl" },
      { type: "text", text: ")" },
    ]);
    expect(linkify("javascript:alert(1) en <script>")).toEqual([{ type: "text", text: "javascript:alert(1) en <script>" }]);
    expect(linkify("https://nl.wikipedia.org/wiki/Bruiloft_(feest)")[0]).toMatchObject({ href: "https://nl.wikipedia.org/wiki/Bruiloft_(feest)" });
    expect(linkify("")).toEqual([]);
  });

  it("only YouTube and Vimeo become a player", () => {
    expect(videoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbed("https://youtu.be/dQw4w9WgXcQ?t=3")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbed("https://www.youtube.com/shorts/abcDEF12345")).toBe("https://www.youtube-nocookie.com/embed/abcDEF12345");
    expect(videoEmbed("https://vimeo.com/76979871")).toBe("https://player.vimeo.com/video/76979871?dnt=1");
    expect(videoEmbed("https://vimeo.com/76979871/abc123def")).toBe("https://player.vimeo.com/video/76979871?dnt=1&h=abc123def");
    expect(videoEmbed("https://player.vimeo.com/video/76979871")).toBe("https://player.vimeo.com/video/76979871?dnt=1");
    expect(videoEmbed("https://evil.example/video.mp4")).toBeNull();
    expect(videoEmbed("https://www.youtube.com/watch?v=<script>")).toBeNull();
    expect(videoEmbed("javascript:alert(1)")).toBeNull();
  });

  it("previews and badges", () => {
    expect(preview("een\n\nlange   tekst", 100)).toBe("een lange tekst");
    expect(preview("abcdefghij", 5)).toBe("abcd…");
    expect(badgeText(3)).toBe("3");
    expect(badgeText(12)).toBe("9+");
  });
});

describe("bundled notifications", () => {
  const now = new Date("2026-11-08T12:00:00Z");

  it("community: at most one mail an hour, the first right away", () => {
    expect(mailDue({ channel: "community", lastMailedAt: null, newItems: 1, now })).toBe(true);
    expect(mailDue({ channel: "community", lastMailedAt: null, newItems: 0, now })).toBe(false);
    expect(mailDue({ channel: "community", lastMailedAt: "2026-11-08T11:30:00Z", newItems: 5, now })).toBe(false);
    expect(mailDue({ channel: "community", lastMailedAt: "2026-11-08T11:00:00Z", newItems: 5, now })).toBe(true);
    expect(nextMailAt("community", "2026-11-08T11:30:00Z", now).toISOString()).toBe("2026-11-08T12:30:00.000Z");
    expect(nextMailAt("community", "2026-11-08T09:00:00Z", now)).toEqual(now);
  });

  it("private messages: per quarter of an hour", () => {
    expect(mailDue({ channel: "private", lastMailedAt: "2026-11-08T11:50:00Z", newItems: 1, now })).toBe(false);
    expect(mailDue({ channel: "private", lastMailedAt: "2026-11-08T11:45:00Z", newItems: 1, now })).toBe(true);
  });

  it("news counts from the later of the last visit and the last mail", () => {
    expect(newsSince("2026-11-08T10:00:00Z", "2026-11-08T11:00:00Z")).toBe("2026-11-08T11:00:00.000Z");
    expect(newsSince("2026-11-08T11:30:00Z", null)).toBe("2026-11-08T11:30:00.000Z");
    expect(newsSince(null, undefined)).toBe("1970-01-01T00:00:00.000Z");
  });

  it("community push at most once an hour", () => {
    expect(pushDue(null, now)).toBe(true);
    expect(pushDue("2026-11-08T11:20:00Z", now)).toBe(false);
    expect(pushDue("2026-11-08T10:59:00Z", now)).toBe(true);
  });
});
