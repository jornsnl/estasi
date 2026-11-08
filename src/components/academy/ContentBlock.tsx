import { Markdown } from "@/components/Markdown";
import { VideoEmbed } from "@/components/VideoEmbed";
import type { Block } from "@/lib/data";
import { sanitizeLessonHtml } from "@/lib/domain/html";
import { formatBytes } from "@/lib/util/format";

/** Lesson text from the editor. Cleaned again here: stored HTML is never trusted blindly. */
export function LessonHtml({ html }: { html: string }) {
  return <div className="prose-academy" dangerouslySetInnerHTML={{ __html: sanitizeLessonHtml(html) }} />;
}

/** Text block: HTML from the editor, or the Markdown of an older block. */
export function TextContent({ block }: { block: Extract<Block, { type: "text" }> }) {
  return block.html ? <LessonHtml html={block.html} /> : <Markdown>{block.markdown}</Markdown>;
}

/**
 * The content blocks of a lesson (video, text, image, download) as a student
 * sees them. Used by the lesson page and by the owner's "Voorbeeld als cursist".
 * Returns null for answerable blocks: those have their own views.
 */
export function ContentBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "video":
      return (
        <figure>
          <VideoEmbed url={block.url} title={block.caption || "Lesvideo"} />
          {block.caption && <figcaption className="mt-2 text-sm text-muted">{block.caption}</figcaption>}
        </figure>
      );
    case "text":
      return <TextContent block={block} />;
    case "image":
      if (!block.file) return null;
      return (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element -- private file behind /api/bestanden, not for next/image */}
          <img src={`/api/bestanden/${block.file.id}`} alt={block.alt} className="h-auto w-full rounded-xl border border-line" loading="lazy" />
          {block.caption && <figcaption className="mt-2 text-sm text-muted">{block.caption}</figcaption>}
        </figure>
      );
    case "download": {
      const href = block.file ? `/api/bestanden/${block.file.id}` : block.url;
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="card flex items-center gap-4 p-4 hover:border-gold">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-gold-soft text-gold-ink" aria-hidden>↓</span>
          <span className="flex-1">
            <span className="block font-medium">{block.label || "Download"}</span>
            {block.description && <span className="block text-sm text-muted">{block.description}</span>}
          </span>
          {block.file && <span className="text-sm text-muted">{formatBytes(block.file.size)}</span>}
        </a>
      );
    }
    default:
      return null;
  }
}
