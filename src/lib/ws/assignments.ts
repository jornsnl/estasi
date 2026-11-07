import "server-only";
import { query } from "./db";
import { todayIso } from "./format";

export interface Assignment {
  id: string;
  couple_id: string;
  title: string;
  intro: string;
  styling_source: boolean;
  visible_from: string | null;
  position: number;
  submitted_at: Date | null;
  ai_summary: string;
  ai_summary_at: Date | null;
  ai_error: string;
  kind: "questions" | "sections";
  closing: string;
  completed_at: Date | null;
  /** Questions answered, or for an assignment in parts: parts marked done. */
  answered: number;
  total: number;
}

export interface SectionField {
  key: string;
  label: string;
  prompts: string[];
}

export interface AssignmentSection {
  id: string;
  title: string;
  intro: string;
  kind: "notes" | "moodboard";
  fields: SectionField[];
  tips: string[];
  embeds: string[];
  example_file_id: string | null;
  notice: string;
  answers: Record<string, string>;
  link: string;
  completed_at: Date | null;
  position: number;
}

export interface AssignmentQuestion {
  id: string;
  prompt: string;
  help: string;
  answer: string;
  position: number;
}

/** A couple only sees assignments whose "visible from" date has come (Sabine sees all). */
export async function assignmentsFor(coupleId: string, isAdmin: boolean): Promise<Assignment[]> {
  return query<Assignment>(
    `select a.*,
            case when a.kind = 'sections'
                 then (select count(*)::int from assignment_sections s where s.assignment_id = a.id and s.completed_at is not null)
                 else (select count(*)::int from assignment_questions q where q.assignment_id = a.id and q.answer <> '') end as answered,
            case when a.kind = 'sections'
                 then (select count(*)::int from assignment_sections s where s.assignment_id = a.id)
                 else (select count(*)::int from assignment_questions q where q.assignment_id = a.id) end as total
       from assignments a
      where a.couple_id = $1 and ($2 or a.visible_from is null or a.visible_from <= $3)
      order by a.position`,
    [coupleId, isAdmin, todayIso()],
  );
}

export const questionsFor = (assignmentId: string) =>
  query<AssignmentQuestion>("select id, prompt, help, answer, position from assignment_questions where assignment_id = $1 order by position", [assignmentId]);

export const sectionsFor = (assignmentId: string) =>
  query<AssignmentSection>(
    `select id, title, intro, kind, fields, tips, embeds, example_file_id, notice, answers, link, completed_at, position
       from assignment_sections where assignment_id = $1 order by position`,
    [assignmentId],
  );

/** Everything filled in, as question and answer pairs (for the summary and the AI). */
export function sectionQA(sections: AssignmentSection[]): { prompt: string; answer: string }[] {
  return sections.flatMap((s) =>
    s.kind === "moodboard"
      ? [{ prompt: `${s.title}: link naar moodboard`, answer: s.link }]
      : s.fields.map((f) => ({
          prompt: `${s.title}${f.label ? `, ${f.label}` : ""}: ${f.prompts.join(" ")}`,
          answer: s.answers?.[f.key] ?? "",
        })),
  );
}
