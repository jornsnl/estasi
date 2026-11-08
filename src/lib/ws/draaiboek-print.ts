import "server-only";
import { query } from "./db";
import type { DayGuestRow } from "./dayguests";
import { guestContactColumns, supplierContactColumns, type ViewerFields } from "./draaiboek-viewer";
import { groupsOf } from "./rsvp";
import { speechesFor } from "./speeches";

/**
 * The data of the printed run sheet, fetched per viewer (feedback 13.5): what
 * the viewer may not see is not selected, not just left off the page. Only
 * reads; nothing here writes.
 */

/** The couple as the print needs it: names, date and place. No contact details or budget. */
export interface PrintCouple {
  id: string;
  partner1_first: string;
  partner2_first: string;
  wedding_date: string | null;
  location: string;
}

export const PRINT_COUPLE_COLUMNS = "id, partner1_first, partner2_first, wedding_date, location";

/** Everyone who is coming, per guest group; the phone number only for viewers who may see it. */
export async function printGuests(coupleId: string, fields: ViewerFields): Promise<{ groups: string[]; guests: DayGuestRow[] }> {
  const groups = await groupsOf(coupleId);
  const guests = await query<DayGuestRow>(
    `select g.id, g.response_id, coalesce(gg.name, 'Zonder groep') as "group", g.first_name, g.last_name, g.relation, g.relation_note,
            ${guestContactColumns(fields)}, ${fields.diet ? "g.diet" : "''::text as diet"}, g.partial_note, g.attendance, g.is_kid, g.important, g.checked_in
       from guests g left join guest_groups gg on gg.id = g.group_id
      where g.couple_id = $1 and g.attendance <> 'no'
      order by gg.position nulls last, g.created_at, g.id`,
    [coupleId],
  );
  return { groups: [...groups.map((g) => g.name), "Zonder groep"], guests };
}

export interface PrintSupplier {
  id: string;
  category_name: string;
  status: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  present_from: string;
  present_until: string;
}

/** The suppliers that have anything filled in; phone and e-mail only for viewers who may see them. */
export async function printSuppliers(coupleId: string, fields: ViewerFields): Promise<PrintSupplier[]> {
  const rows = await query<PrintSupplier>(
    `select s.id, c.name as category_name, s.status, s.name, s.contact_person, ${supplierContactColumns(fields)}, s.present_from, s.present_until
       from couple_suppliers s join supplier_categories c on c.id = s.category_id
      where s.couple_id = $1 and not c.archived
      order by c.couple_id nulls first, c.position, c.name, s.position, s.created_at`,
    [coupleId],
  );
  return rows.filter((s) => s.name || s.contact_person || s.phone || s.email || s.present_from || s.present_until);
}

/** Speeches: only fetched for a viewer who may see them (Sabine). */
export async function printSpeeches(coupleId: string, fields: ViewerFields) {
  return fields.speeches ? speechesFor(coupleId) : null;
}
