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

export type PackageKind = "wp" | "cm" | "od";

/** Without WP or CM (only the opening dance) the couple sees a short menu. */
export function sectionsFor(kinds: PackageKind[], isAdmin: boolean) {
  const planningPackage = kinds.length === 0 || kinds.includes("wp") || kinds.includes("cm");
  return {
    planning: isAdmin || planningPackage,
    dance: isAdmin || kinds.includes("od"),
    /** What the couple itself would see; Sabine uses it to see what applies. */
    planningPackage,
    danceOnly: !planningPackage,
  };
}

/** Fills [namen], [datum] and the like; unknown placeholders stay as they are. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\[([a-z]+)\]/gi, (match, key: string) => (key.toLowerCase() in values ? values[key.toLowerCase()] : match));
}

/**
 * "Alleen tonen als": a question with a condition shows only when the other
 * question (itself visible) has that answer. For several choices, one of
 * them is enough. Chains are followed; a loop counts as hidden.
 */
export function isQuestionVisible(
  question: { id: string; show_if_question_id: string | null; show_if_value: string },
  questions: { id: string; show_if_question_id: string | null; show_if_value: string }[],
  answers: Record<string, string | string[]>,
  seen: Set<string> = new Set(),
): boolean {
  if (!question.show_if_question_id) return true;
  if (seen.has(question.id)) return false;
  seen.add(question.id);
  const parent = questions.find((q) => q.id === question.show_if_question_id);
  if (!parent || !isQuestionVisible(parent, questions, answers, seen)) return false;
  const answer = answers[parent.id];
  const wanted = question.show_if_value.trim().toLowerCase();
  const given = (Array.isArray(answer) ? answer : [answer ?? ""]).map((a) => a.trim().toLowerCase());
  return wanted === "" ? given.some(Boolean) : given.includes(wanted);
}

const normName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/** "Jan & Els de Vries", "Jan, Els en Pim": the people of a household. */
export function householdNames(names: string): string[] {
  const parts = names.split(/\s*(?:&|,|\+|\/|\ben\b)\s*/i).map((p) => p.trim()).filter(Boolean);
  // "Jan & Els de Vries": the last name of the last person counts for the others too.
  const last = parts.length > 1 ? parts[parts.length - 1].split(" ").slice(1).join(" ") : "";
  return parts.map((p) => (p.includes(" ") || !last ? p : `${p} ${last}`));
}

/**
 * Has this household responded? "yes" on the same e-mail address or full
 * name (or confirmed by hand); "maybe" when only a first name matches, so
 * someone confirms; "no" otherwise.
 */
export function matchInvitation(
  invitation: { email: string; names: string; response_id: string | null },
  responses: { id: string; email: string; people: string[] }[],
): { state: "yes" | "maybe" | "no"; responseId: string | null; candidate?: string } {
  if (invitation.response_id && responses.some((r) => r.id === invitation.response_id)) return { state: "yes", responseId: invitation.response_id };
  const email = invitation.email.trim().toLowerCase();
  if (email) {
    const byMail = responses.find((r) => r.email.trim().toLowerCase() === email);
    if (byMail) return { state: "yes", responseId: byMail.id };
  }
  const people = householdNames(invitation.names).map(normName);
  for (const r of responses) {
    if (r.people.some((p) => people.includes(normName(p)))) return { state: "yes", responseId: r.id };
  }
  const firsts = people.map((p) => p.split(" ")[0]).filter((f) => f.length > 1);
  for (const r of responses) {
    const hit = r.people.find((p) => firsts.includes(normName(p).split(" ")[0]));
    if (hit) return { state: "maybe", responseId: r.id, candidate: hit };
  }
  return { state: "no", responseId: null };
}

/**
 * Where a row with this time belongs (index among the other rows): before
 * the first row with a later time.
 */
export function indexForTime(rows: { id: string; at_time: string }[], id: string, time: string): number {
  const key = timeKey(time);
  const others = rows.filter((r) => r.id !== id);
  if (key === Number.MAX_SAFE_INTEGER) return rows.findIndex((r) => r.id === id);
  // Before the first timed row that is later; untimed rows stay with the row above them.
  const later = others.findIndex((r) => {
    const k = timeKey(r.at_time);
    return k !== Number.MAX_SAFE_INTEGER && k > key;
  });
  return later === -1 ? others.length : later;
}

/** A time that does not fit between the timed rows around it (after dragging): shown light red. */
export function timeOutOfOrder(rows: { at_time: string }[], index: number): boolean {
  const key = timeKey(rows[index].at_time);
  if (key === Number.MAX_SAFE_INTEGER) return false;
  const before = rows.slice(0, index).map((r) => timeKey(r.at_time)).filter((k) => k !== Number.MAX_SAFE_INTEGER);
  const after = rows.slice(index + 1).map((r) => timeKey(r.at_time)).filter((k) => k !== Number.MAX_SAFE_INTEGER);
  return (before.length > 0 && before[before.length - 1] > key) || (after.length > 0 && after[0] < key);
}

export interface StylingProposal {
  summary: string;
  colors: string[];
  items: { place: string; what: string }[];
}

/** Reads the JSON answer forgivingly (a code fence or text around it is fine). */
export function parseStylingProposal(text: string, places: string[]): StylingProposal {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let data: { samenvatting?: unknown; kleuren?: unknown; items?: unknown } = {};
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { summary: text.trim(), colors: extractColors(text), items: [] };
  }
  const known = new Map(places.map((p) => [p.toLowerCase(), p]));
  const items = (Array.isArray(data.items) ? data.items : [])
    .map((i: { plek?: unknown; wat?: unknown }) => ({ place: known.get(String(i?.plek ?? "").trim().toLowerCase()) ?? "", what: String(i?.wat ?? "").trim().slice(0, 300) }))
    .filter((i) => i.place && i.what)
    .slice(0, 60);
  const colors = (Array.isArray(data.kleuren) ? data.kleuren : []).map(String).filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)).map((c) => c.toLowerCase()).slice(0, 8);
  return { summary: String(data.samenvatting ?? "").trim(), colors, items };
}


const DIETS: [string, RegExp][] = [
  ["vegan", /\bvegan|veganist/i],
  ["vega", /\bvega\b|vegetari/i],
  ["glutenvrij", /gluten|coeliak/i],
  ["lactosevrij", /lactose|zuivel|melk/i],
  ["noten", /noot|noten|pinda/i],
  ["vis/schaal", /\bvis\b|schaal|garnaal|kreeft|mossel/i],
  ["halal", /halal/i],
];

/** "3 vega, 2 glutenvrij, 4 overig": what a group of guests has filled in as diet. */
export function dietSummary(diets: string[]): string {
  const counts = new Map<string, number>();
  for (const raw of diets) {
    const diet = raw.trim();
    if (!diet || /^(geen|nee|n\.?v\.?t\.?|-)$/i.test(diet)) continue;
    const hits = DIETS.filter(([, re]) => re.test(diet)).map(([name]) => name);
    // "vegan" also matches "vega"-ish words: one label per guest is enough.
    for (const name of hits.length ? (hits.includes("vegan") ? ["vegan", ...hits.filter((h) => h !== "vegan" && h !== "vega")] : hits) : ["overig"]) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const order = [...DIETS.map(([n]) => n), "overig"];
  return [...counts.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([n, c]) => `${c} ${n}`).join(", ");
}
