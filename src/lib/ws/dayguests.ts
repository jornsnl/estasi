import "server-only";
import { query } from "./db";
import { groupsOf } from "./rsvp";

export interface DayGuestRow {
  id: string;
  response_id: string | null;
  group: string;
  first_name: string;
  last_name: string;
  relation: string;
  relation_note: string;
  phone: string;
  diet: string;
  partial_note: string;
  attendance: string;
  is_kid: boolean;
  important: boolean;
  checked_in: boolean;
}

/** Everyone who is coming (no declines), per guest group, people who signed up together side by side. */
export async function dayGuests(coupleId: string): Promise<{ groups: string[]; guests: DayGuestRow[] }> {
  const groups = await groupsOf(coupleId);
  const guests = await query<DayGuestRow>(
    `select g.id, g.response_id, coalesce(gg.name, 'Zonder groep') as "group", g.first_name, g.last_name, g.relation, g.relation_note,
            g.phone, g.diet, g.partial_note, g.attendance, g.is_kid, g.important, g.checked_in
       from guests g left join guest_groups gg on gg.id = g.group_id
      where g.couple_id = $1 and g.attendance <> 'no'
      order by gg.position nulls last, g.created_at, g.id`,
    [coupleId],
  );
  const names = [...groups.map((g) => g.name), "Zonder groep"];
  return { groups: names, guests };
}
