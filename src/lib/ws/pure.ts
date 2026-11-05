// Small pure helpers for Your Wedding Space, kept free of server imports so they are unit tested.

/** "Jan Verheuven" to first and last name; "Anne van der Berg" keeps "van der Berg" as last name. */
export function splitName(full: string): { first: string; last: string } {
  const clean = full.trim().replace(/\s+/g, " ");
  const i = clean.indexOf(" ");
  return i === -1 ? { first: clean, last: "" } : { first: clean.slice(0, i), last: clean.slice(i + 1) };
}

/** Names from the "who do you bring" field: one per line, or separated by commas. At most 12. */
export function partyNames(input: string): string[] {
  return input
    .split(/[\n,;]+/)
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 12);
}

/** Minutes after midnight for "8:30", "08.30" or "11:00 uur"; rows without a time go last. */
export function timeKey(value: string): number {
  const m = value.match(/(\d{1,2})[:.](\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.MAX_SAFE_INTEGER;
}

/** Hex colours mentioned in a text, lower case and without duplicates, at most 8. */
export function extractColors(text: string): string[] {
  return [...new Set((text.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((c) => c.toLowerCase()))].slice(0, 8);
}
