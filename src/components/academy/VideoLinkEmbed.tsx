import { videoEmbed } from "@/lib/util/video";

/** A YouTube or Vimeo link embedded (field type video_link); nothing for any other link. */
export function VideoLinkEmbed({ url, title }: { url: string; title: string }) {
  const src = videoEmbed(url);
  if (!src) return null;
  return (
    <div className="aspect-video w-full max-w-2xl overflow-hidden rounded-lg bg-ink">
      <iframe
        src={src}
        title={title}
        className="h-full w-full"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
