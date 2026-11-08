import sanitizeHtml from "sanitize-html";

/**
 * Lesson text from the editor is HTML. It is cleaned with this allowlist when
 * it is saved and again every time it is shown, so a script, an event
 * attribute (onclick) or a style never reaches a student's browser.
 */

/** Pictures only from the Academy's own file storage. */
export const LESSON_IMAGE_SRC = /^\/api\/bestanden\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LESSON_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s",
    "ul", "ol", "li", "a", "blockquote", "hr", "code", "pre",
    "table", "thead", "tbody", "tr", "th", "td", "colgroup", "col", "img",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "title"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
    ol: ["start"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: [] },
  allowProtocolRelative: false,
  // h1 is the lesson title: a heading in the text becomes h2.
  transformTags: {
    h1: "h2",
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...(attribs.href ? { href: attribs.href } : {}), target: "_blank", rel: "noopener noreferrer" },
    }),
  },
  exclusiveFilter: (frame) => frame.tag === "img" && !LESSON_IMAGE_SRC.test(frame.attribs.src ?? ""),
  disallowedTagsMode: "discard",
};

export function sanitizeLessonHtml(html: string): string {
  return sanitizeHtml(html, LESSON_HTML_OPTIONS).trim();
}

/** True when the HTML has no visible content (an empty editor gives "<p></p>"). */
export function isEmptyHtml(html: string): boolean {
  if (/<(img|table|hr)\b/i.test(html)) return false;
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;|\s/g, "") === "";
}
