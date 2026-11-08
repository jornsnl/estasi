import "server-only";
import { requireOwner } from "@/lib/auth/session";
import { query } from "./db";

/**
 * Speeches (feedback 12) are for Sabine only: a speech can be a surprise.
 * Every read goes through here and checks the owner role itself, so a
 * page that forgets to check still never shows them to a couple.
 */

export interface Speech {
  id: string;
  couple_id: string;
  guest_id: string | null;
  speaker_name: string;
  relation: string;
  moment: string;
  moment_other: string;
  planned_time: string;
  duration_minutes: number | null;
  needs: string[];
  needs_other: string;
  phone: string;
  email: string;
  status: string;
  surprise: boolean;
  notes: string;
  position: number;
  created_at: Date;
  updated_at: Date;
}

/** The couple's speeches in Sabine's order; the speaker's current guest name when picked from the guest list. */
export async function speechesFor(coupleId: string): Promise<Speech[]> {
  await requireOwner();
  return query<Speech>(
    `select s.*, coalesce(nullif(trim(g.first_name || ' ' || g.last_name), ''), s.speaker_name) as speaker_name
       from speeches s left join guests g on g.id = s.guest_id and g.couple_id = s.couple_id
      where s.couple_id = $1 order by s.position, s.created_at`,
    [coupleId],
  );
}
