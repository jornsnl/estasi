/** Turns a YouTube, Vimeo or direct video link into an embedded player. */
export function embedUrl(url: string): { kind: "iframe" | "video"; src: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v") ?? u.pathname.split("/").pop();
      if (id) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}` };
    }
    if (host === "youtu.be") return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed${u.pathname}` };
    if (host === "player.vimeo.com") return { kind: "iframe", src: url };
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id) return { kind: "iframe", src: `https://player.vimeo.com/video/${id}?dnt=1` };
    }
    if (/\.(mp4|webm|mov)$/i.test(u.pathname)) return { kind: "video", src: url };
    return null;
  } catch {
    return null;
  }
}

export function VideoEmbed({ url, title }: { url: string; title: string }) {
  const embed = embedUrl(url);
  if (!embed) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-line bg-cream text-sm text-muted">
        Geen geldige videolink
      </div>
    );
  }
  return (
    <div className="aspect-video overflow-hidden rounded-xl bg-ink">
      {embed.kind === "iframe" ? (
        <iframe
          src={embed.src}
          title={title}
          className="h-full w-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <video src={embed.src} controls className="h-full w-full" />
      )}
    </div>
  );
}
