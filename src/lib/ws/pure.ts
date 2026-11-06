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
