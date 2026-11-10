import "server-only";
import { listFeedbackRequests } from "@/lib/data/assignments";
import { stillOnTaskPage } from "@/lib/domain/feedback";
import { query } from "./db";

/**
 * Everything that waits for Sabine, shown on the Taken page (/beheer/bruidsparen/takenbord).
 * The menu badge "Taken" counts exactly the same items (feedback Sabine: the counter
 * left out the questions, the assignments to summarise and the feedback for students).
 */

export interface Row {
  id: string;
  title: string;
  deadline: string | null;
  couple_id: string;
  partner1_first: string;
  partner2_first: string;
  wedding_date: string | null;
}

export interface OpenQuestion {
  id: string;
  body: string;
  asked_by_name: string;
  asked_at: Date;
  couple_id: string;
  partner1_first: string;
  partner2_first: string;
}

export interface ToSummarise {
  id: string;
  title: string;
  submitted_at: Date;
  couple_id: string;
  partner1_first: string;
  partner2_first: string;
}

export async function loadSabineBoard() {
  const [rows, questions, summaries, feedback] = await Promise.all([
    query<Row>(
      `select t.id, t.title, t.deadline, c.id as couple_id, c.partner1_first, c.partner2_first, c.wedding_date
         from tasks t join couples c on c.id = t.couple_id
        where t.lane = 'sabine' and t.done_at is null and c.status <> 'archived'
        order by c.wedding_date nulls last, c.id, t.deadline nulls last, t.position`,
    ),
    query<OpenQuestion>(
      `select q.id, q.body, q.asked_by_name, q.asked_at, c.id as couple_id, c.partner1_first, c.partner2_first
         from questions q join couples c on c.id = q.couple_id
        where q.answered_at is null and c.status <> 'archived'
        order by q.asked_at`,
    ),
    query<ToSummarise>(
      `select a.id, a.title, a.submitted_at, c.id as couple_id, c.partner1_first, c.partner2_first
         from assignments a join couples c on c.id = a.couple_id
        where a.submitted_at is not null and coalesce(a.ai_summary, '') = '' and c.status <> 'archived'
        order by a.submitted_at`,
    ),
    listFeedbackRequests().then((list) => list.filter(stillOnTaskPage)).catch(() => []),
  ]);
  return { rows, questions, summaries, feedback };
}

/** The number on the "Taken" menu item: all four parts of the Taken page together. */
export async function sabineOpenCount(): Promise<number> {
  const board = await loadSabineBoard();
  return openCount(board);
}

export const openCount = (board: { rows: unknown[]; questions: unknown[]; summaries: unknown[]; feedback: unknown[] }) =>
  board.rows.length + board.questions.length + board.summaries.length + board.feedback.length;
