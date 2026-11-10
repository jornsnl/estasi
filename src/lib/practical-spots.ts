import "server-only";
import { isUuid, one, query } from "@/lib/db";

/**
 * Praktijkplekken (feedback Sabine): the weddings where a student of package B walks along.
 * Sabine adds the date and the names of the couple in Instellingen and links a student to
 * each wedding (migration 0035, public.practical_spots).
 */

export interface PracticalSpot {
  id: string;
  wedding_date: string;
  couple_names: string;
  student_user_id: string | null;
  student_name: string | null;
  note: string;
}

const SELECT = `
  select s.id, s.wedding_date, s.couple_names, s.student_user_id, u.name as student_name, s.note
    from public.practical_spots s left join public.users u on u.id = s.student_user_id`;

/** All weddings, the coming ones first in date order, then the past ones (latest first). */
export async function listPracticalSpots(today: string): Promise<PracticalSpot[]> {
  return query<PracticalSpot>(
    `${SELECT} order by (s.wedding_date < $1::date), case when s.wedding_date >= $1::date then s.wedding_date end, s.wedding_date desc, s.created_at`,
    [today],
  );
}

/** The weddings one student is linked to (shown on the student page in the beheer). */
export async function practicalSpotsOf(userId: string): Promise<PracticalSpot[]> {
  if (!isUuid(userId)) return [];
  return query<PracticalSpot>(`${SELECT} where s.student_user_id = $1 order by s.wedding_date`, [userId]);
}

export interface SpotInput {
  wedding_date: string;
  couple_names: string;
  student_user_id: string | null;
  note: string;
}

export async function addPracticalSpot(input: SpotInput): Promise<string> {
  const row = await one<{ id: string }>(
    "insert into public.practical_spots (wedding_date, couple_names, student_user_id, note) values ($1, $2, $3, $4) returning id",
    [input.wedding_date, input.couple_names, input.student_user_id, input.note],
  );
  return row!.id;
}

export async function updatePracticalSpot(id: string, input: SpotInput): Promise<boolean> {
  if (!isUuid(id)) return false;
  const row = await one<{ id: string }>(
    "update public.practical_spots set wedding_date = $2, couple_names = $3, student_user_id = $4, note = $5 where id = $1 returning id",
    [id, input.wedding_date, input.couple_names, input.student_user_id, input.note],
  );
  return Boolean(row);
}

export async function removePracticalSpot(id: string): Promise<PracticalSpot | null> {
  if (!isUuid(id)) return null;
  const before = await one<PracticalSpot>(`${SELECT} where s.id = $1`, [id]);
  if (before) await query("delete from public.practical_spots where id = $1", [id]);
  return before;
}
