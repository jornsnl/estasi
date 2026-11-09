import type { Block } from "@/lib/data";

const HEADING_CLASS = {
  title: "font-serif text-3xl text-ink",
  subtitle: "font-serif text-2xl text-bordeaux",
  caption: "text-sm text-ink",
  assignment: "font-serif text-xl font-semibold text-ink",
} as const;

/** A title block in one of the fixed lesson styles (also the preview in the editor). */
export function HeadingContent({ block }: { block: Extract<Block, { type: "heading" }> }) {
  if (!block.text) return null;
  const className = HEADING_CLASS[block.style] ?? HEADING_CLASS.title;
  if (block.style === "title") return <h2 className={className}>{block.text}</h2>;
  if (block.style === "caption") return <p className={className}>{block.text}</p>;
  return <h3 className={className}>{block.text}</h3>;
}
