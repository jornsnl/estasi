import { linkify, videoEmbed } from "@/lib/community/rules";
import type { AttachmentView } from "@/lib/community/server";
import { formatBytes } from "@/lib/ws/upload-rules";

/**
 * How text, video links and attachments of the community and the private
 * messages are shown. Text written by people is never HTML: it is rendered
 * as React text (escaped), with only http(s) links made clickable.
 */

export function PlainText({ text, className = "" }: { text: string; className?: string }) {
  if (!text) return null;
  return (
    <p className={`break-words whitespace-pre-wrap ${className}`}>
      {linkify(text).map((segment, n) =>
        segment.type === "link" ? (
          <a key={n} href={segment.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-bordeaux underline underline-offset-2 break-all">
            {segment.text}
          </a>
        ) : (
          <span key={n}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

export function VideoLink({ url, title }: { url: string; title: string }) {
  const src = videoEmbed(url);
  if (!src) return null;
  return (
    <div className="aspect-video overflow-hidden rounded-lg bg-ink">
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

export const attachmentUrl = (id: string) => `/api/community/bestanden/${id}`;

export function Attachments({ items }: { items: AttachmentView[] }) {
  if (items.length === 0) return null;
  const images = items.filter((a) => a.kind === "image");
  const videos = items.filter((a) => a.kind === "video");
  const files = items.filter((a) => a.kind === "file");
  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className={`grid gap-2 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"}`}>
          {images.map((image) => (
            <a key={image.id} href={attachmentUrl(image.id)} target="_blank" rel="noopener" className={`overflow-hidden rounded-lg border border-line bg-cream ${images.length === 1 ? "inline-block max-w-full" : "block"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachmentUrl(image.id)}
                alt={image.name}
                loading="lazy"
                className={images.length === 1 ? "max-h-[28rem] max-w-full object-contain" : "aspect-square w-full object-cover"}
              />
            </a>
          ))}
        </div>
      )}
      {videos.map((video) => (
        <video key={video.id} src={attachmentUrl(video.id)} controls preload="metadata" className="max-h-[28rem] w-full rounded-lg bg-ink" />
      ))}
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((file) => (
            <li key={file.id}>
              <a href={attachmentUrl(file.id)} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm hover:border-gold">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-gold-ink" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                  <path d="M14 3v6h6" />
                </svg>
                <span className="truncate">{file.name}</span>
                <span className="shrink-0 text-xs text-muted">{formatBytes(file.size)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Avatar({ name, owner }: { name: string; owner?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-serif text-sm ${
        owner ? "bg-bordeaux text-white" : "bg-gold-soft text-gold-ink"
      }`}
    >
      {initials || "?"}
    </span>
  );
}
