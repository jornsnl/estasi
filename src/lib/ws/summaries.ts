import "server-only";
import { sectionQA, sectionsFor } from "./assignments";
import { one, query, tx } from "./db";
import type { StylingProposal } from "./pure";

/**
 * Summaries of assignments, shared by the buttons in the portal (with
 * ANTHROPIC_API_KEY) and the MCP tools (Sabine's own Claude does the
 * writing). Reading the answers and storing the result live here, so both
 * ways end in exactly the same place.
 */

export interface QA {
  prompt: string;
  answer: string;
}

/** Every answer of one assignment as question and answer pairs, for both kinds (questions and parts). */
export async function assignmentQA(assignmentId: string, kind: string): Promise<QA[]> {
  return kind === "sections"
    ? sectionQA(await sectionsFor(assignmentId))
    : query<QA>("select prompt, answer from assignment_questions where assignment_id = $1 order by position", [assignmentId]);
}

/** The filled in styling sources of a couple (Thema & Styling, Thema & Moodboard). */
export async function stylingSources(coupleId: string): Promise<{ id: string; title: string; items: QA[] }[]> {
  const sources = await query<{ id: string; title: string; kind: string }>(
    "select id, title, kind from assignments where couple_id = $1 and styling_source order by position",
    [coupleId],
  );
  const filled = [];
  for (const s of sources) {
    const items = await assignmentQA(s.id, s.kind);
    if (items.some((i) => i.answer.trim())) filled.push({ id: s.id, title: s.title, items });
  }
  return filled;
}

export const stylingPlaces = (coupleId: string) =>
  query<{ id: string; name: string }>("select id, name from styling_places where couple_id = $1 order by position", [coupleId]);

/**
 * Stores a styling summary as a draft only Sabine sees: the overview text,
 * the palette (only when there is none yet) and per place the proposed
 * items, replacing earlier proposals that were never released.
 */
export async function saveStylingProposal(coupleId: string, proposal: StylingProposal): Promise<{ count: number; unknownPlaces: string[] }> {
  const places = await stylingPlaces(coupleId);
  const byName = new Map(places.map((p) => [p.name.trim().toLowerCase(), p]));
  const unknownPlaces = [...new Set(proposal.items.map((i) => i.place).filter((name) => !byName.has(name.trim().toLowerCase())))];
  let count = 0;
  await tx(async (db) => {
    await query(
      `insert into styling_plans (couple_id, ai_draft, ai_draft_at, colors, ai_error) values ($1, $2, now(), $3::jsonb, '')
       on conflict (couple_id) do update set ai_draft = excluded.ai_draft, ai_draft_at = now(), ai_error = '',
         colors = case when jsonb_array_length(styling_plans.colors) = 0 then excluded.colors else styling_plans.colors end`,
      [coupleId, proposal.summary, JSON.stringify(proposal.colors)],
      db,
    );
    await query("delete from styling_items where couple_id = $1 and draft", [coupleId], db);
    for (const item of proposal.items) {
      const place = byName.get(item.place.trim().toLowerCase());
      if (!place) continue;
      await query(
        `insert into styling_items (couple_id, place_id, what, draft, position)
         values ($1, $2, $3, true, (select coalesce(max(position), 0) + 1 from styling_items where place_id = $2))`,
        [coupleId, place.id, item.what],
        db,
      );
      count++;
    }
  });
  return { count, unknownPlaces };
}

/** Stores the summary of one assignment (questions); the couple sees it on the assignment page. */
export async function saveAssignmentSummary(assignmentId: string, summary: string): Promise<boolean> {
  const row = await one("update assignments set ai_summary = $2, ai_summary_at = now(), ai_error = '' where id = $1 returning id", [assignmentId, summary]);
  return Boolean(row);
}

/** The lines in Sabine's notification mail about making the summary with Claude through the MCP connection. */
export function claudeSummaryHint(coupleName: string, title: string, styling: boolean): string {
  return [
    "Samenvatting maken met Claude:",
    `Open Claude met de koppeling "Wedding Plan Academy" (MCP) en vraag bijvoorbeeld: "Maak de samenvatting van ${title} voor ${coupleName}."`,
    styling
      ? "Claude leest de antwoorden, schrijft het overzicht van stijl, sfeer, kleuren en materialen met per plek voorstellen, en zet alles als concept op de pagina Styling. Alleen jij ziet het tot je het vrijgeeft."
      : "Claude leest de antwoorden en zet de samenvatting bij de opdracht in het portaal. Lees hem na; het bruidspaar ziet hem daar ook.",
  ].join("\n");
}
