// Shared parser for YouTube and Vimeo links: the community (video links in
// posts) and assignments (field type video_link) embed videos with it.
// Pure, so client components and tests use it too.

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
