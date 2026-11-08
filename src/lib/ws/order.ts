import "server-only";
import { query, tx } from "./db";

/** Tables whose rows have a position within a scope (never taken from the browser). */
const SCOPES = {
  rsvp_questions: "form_id",
  guest_groups: "couple_id",
  rsvp_forms: "couple_id",
  runsheet_tabs: "couple_id",
  runsheet_rows: "tab_id",
  packing_items: "list_id",
  group_photos: "couple_id",
  meal_moments: "couple_id",
  meal_rows: "couple_id",
  styling_places: "couple_id",
  styling_items: "place_id",
  invitations: "couple_id",
  speeches: "couple_id",
} as const;
export type OrderedTable = keyof typeof SCOPES;

/**
 * Moves a row one place up or down, or to a given index, within its scope
 * (and only when that scope belongs to the couple: the caller passes the
 * scope value it checked). Positions are renumbered 1..n.
 */
export async function moveRow(table: OrderedTable, id: string, scopeValue: string, to: "up" | "down" | number): Promise<boolean> {
  const column = SCOPES[table];
  return tx(async (db) => {
    const rows = await query<{ id: string }>(`select id from ${table} where ${column} = $1 order by position, id for update`, [scopeValue], db);
    const from = rows.findIndex((r) => r.id === id);
    if (from === -1) return false;
    const target = to === "up" ? from - 1 : to === "down" ? from + 1 : Math.round(to);
    if (target < 0 || target >= rows.length || target === from) return false;
    const [row] = rows.splice(from, 1);
    rows.splice(target, 0, row);
    for (let i = 0; i < rows.length; i++) await query(`update ${table} set position = $2 where id = $1`, [rows[i].id, i + 1], db);
    return true;
  });
}
