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
  answered: number;
  total: number;
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
            (select count(*)::int from assignment_questions q where q.assignment_id = a.id and q.answer <> '') as answered,
            (select count(*)::int from assignment_questions q where q.assignment_id = a.id) as total
       from assignments a
      where a.couple_id = $1 and ($2 or a.visible_from is null or a.visible_from <= $3)
      order by a.position`,
    [coupleId, isAdmin, todayIso()],
  );
}

export const questionsFor = (assignmentId: string) =>
  query<AssignmentQuestion>("select id, prompt, help, answer, position from assignment_questions where assignment_id = $1 order by position", [assignmentId]);
