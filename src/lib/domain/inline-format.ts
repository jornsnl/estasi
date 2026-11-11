/**
 * Simple text formatting in the plain writing fields of lesson content (feedback Sabine): the
 * question of an assignment, the explanation above it, the learning goals. The owner chooses
 * herself what is bold, italic or underlined; nothing is bold by itself any more.
 *
 * The markers are the ones the toolbar writes (src/components/academy/FormatTextarea.tsx):
 * **vet**, *schuin* and __onderstreept__. Anything else stays plain text, so there is no HTML
 * to clean. Where the text has to be plain (an aria-label, a title, a mail), stripInlineFormat
 * takes the markers out.
 */

export type InlineMark = "bold" | "italic" | "underline";
export type InlineNode = string | { mark: InlineMark; children: InlineNode[] };

// Bold before italic: "**" would otherwise be read as two empty italics. Inner text may not
// start or end with a space, as in Markdown, so "2 * 3 * 4" stays as it is. A closing marker
// followed by one more of the same sign belongs to a mark inside ("**vet *en schuin***").
const PATTERN = /\*\*(\S(?:[\s\S]*?\S)?)\*\*(?!\*)|__(\S(?:[\s\S]*?\S)?)__(?!_)|\*(\S(?:[\s\S]*?\S)?)\*/g;

export function parseInlineFormat(text: string, depth = 0): InlineNode[] {
  if (!text) return [];
  if (depth > 3) return [text];
  const nodes: InlineNode[] = [];
  let last = 0;
  for (const match of text.matchAll(PATTERN)) {
    const at = match.index ?? 0;
    if (at > last) nodes.push(text.slice(last, at));
    const [, bold, underline, italic] = match;
    const mark: InlineMark = bold !== undefined ? "bold" : underline !== undefined ? "underline" : "italic";
    nodes.push({ mark, children: parseInlineFormat(bold ?? underline ?? italic ?? "", depth + 1) });
    last = at + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const plain = (nodes: InlineNode[]): string => nodes.map((n) => (typeof n === "string" ? n : plain(n.children))).join("");

/** The text without the markers, for places that only take plain text. */
export const stripInlineFormat = (text: string) => plain(parseInlineFormat(text));

export const INLINE_MARKERS: Record<InlineMark, string> = { bold: "**", italic: "*", underline: "__" };

/**
 * Wraps the selection in the marker, or takes the marker away when the selection already has
 * it (also when the markers sit just outside the selection). Returns the new text and the
 * selection to set afterwards.
 */
export function toggleInlineMark(
  value: string,
  start: number,
  end: number,
  mark: InlineMark,
): { text: string; from: number; to: number; replaceFrom: number; replaceTo: number } {
  const m = INLINE_MARKERS[mark];
  const selected = value.slice(start, end);
  // The markers are part of the selection.
  if (selected.length >= m.length * 2 && selected.startsWith(m) && selected.endsWith(m) && isExactly(selected, mark)) {
    const inner = selected.slice(m.length, selected.length - m.length);
    return { text: inner, from: start, to: start + inner.length, replaceFrom: start, replaceTo: end };
  }
  // The markers sit right around the selection.
  const before = value.slice(Math.max(0, start - m.length), start);
  const after = value.slice(end, end + m.length);
  if (selected && before === m && after === m && isExactly(`${m}${selected}${m}`, mark)) {
    return { text: selected, from: start - m.length, to: end - m.length, replaceFrom: start - m.length, replaceTo: end + m.length };
  }
  // Spaces at the edges stay outside the markers, otherwise they would not count as formatting.
  const lead = selected.length - selected.trimStart().length;
  const trail = selected.length - selected.trimEnd().length;
  const core = selected.trim() || "tekst";
  const text = `${selected.slice(0, lead)}${m}${core}${m}${selected.trim() ? selected.slice(selected.length - trail) : ""}`;
  const from = start + lead + m.length;
  return { text, from, to: from + core.length, replaceFrom: start, replaceTo: end };
}

/** True when the whole string is one piece of text with exactly this mark. */
function isExactly(text: string, mark: InlineMark) {
  const nodes = parseInlineFormat(text);
  return nodes.length === 1 && typeof nodes[0] !== "string" && nodes[0].mark === mark;
}

const TAGS: Record<InlineMark, string> = { bold: "strong", italic: "em", underline: "u" };

/** The text as HTML with <strong>, <em> and <u> (the portfolio export). The text itself is escaped. */
export function inlineFormatHtml(text: string, escape: (value: string) => string): string {
  const html = (nodes: InlineNode[]): string =>
    nodes.map((n) => (typeof n === "string" ? escape(n) : `<${TAGS[n.mark]}>${html(n.children)}</${TAGS[n.mark]}>`)).join("");
  return html(parseInlineFormat(text));
}
