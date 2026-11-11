import "server-only";
import { listFeedbackRequests } from "@/lib/data/assignments";
import { stillOnTaskPage } from "@/lib/domain/feedback";
import { query } from "./db";

/**
 * Everything that waits for Sabine (also requests for an opening dance package and, of the assignments,
 * only Thema & Styling until she ticks its summary off: feedback Sabine 5 and 6), shown on the Taken page (/beheer/bruidsparen/takenbord).
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

/** Feedback Sabine (5): a couple asked for an opening dance package. */
export interface DanceRequest {
  id: string;
  package_name: string;
  message: string;
  requested_by_name: string;
  created_at: Date;
  couple_id: string;
  partner1_first: string;
  partner2_first: string;
  wedding_date: string | null;
}

export async function loadSabineBoard() {
  const [rows, questions, summaries, feedback, dances] = await Promise.all([
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
        where a.submitted_at is not null and a.styling_source and not a.budget and a.summary_done_at is null and c.status <> 'archived'
        order by a.submitted_at`,
    ),
    listFeedbackRequests().then((list) => list.filter(stillOnTaskPage)).catch(() => []),
    query<DanceRequest>(
      `select r.id, r.package_name, r.message, r.requested_by_name, r.created_at, c.id as couple_id, c.partner1_first, c.partner2_first, c.wedding_date
         from dance_requests r join couples c on c.id = r.couple_id
        where r.handled_at is null and c.status <> 'archived'
        order by r.created_at`,
    ),
  ]);
  return { rows, questions, summaries, feedback, dances };
}

/** The number on the "Taken" menu item: all parts of the Taken page together. */
export async function sabineOpenCount(): Promise<number> {
  const board = await loadSabineBoard();
  return openCount(board);
}

export const openCount = (board: { rows: unknown[]; questions: unknown[]; summaries: unknown[]; feedback: unknown[]; dances: unknown[] }) =>
  board.rows.length + board.questions.length + board.summaries.length + board.feedback.length + board.dances.length;
