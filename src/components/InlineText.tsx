import { Fragment } from "react";
import { parseInlineFormat, type InlineNode } from "@/lib/domain/inline-format";

/**
 * Text from a plain writing field with the formatting the owner chose (**vet**, *schuin*,
 * __onderstreept__, see src/lib/domain/inline-format.ts). Renders React elements only, never
 * HTML, so it is as safe as plain text. Line breaks stay where the parent keeps them
 * (whitespace-pre-line).
 */
export function InlineText({ text }: { text: string }) {
  return <>{render(parseInlineFormat(text))}</>;
}

function render(nodes: InlineNode[]): React.ReactNode {
  return nodes.map((node, i) => {
    if (typeof node === "string") return <Fragment key={i}>{node}</Fragment>;
    const inner = render(node.children);
    if (node.mark === "bold") return <strong key={i} className="font-semibold">{inner}</strong>;
    if (node.mark === "italic") return <em key={i}>{inner}</em>;
    return <u key={i}>{inner}</u>;
  });
}
