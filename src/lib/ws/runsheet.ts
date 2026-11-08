import "server-only";
import { query, tx } from "./db";
import { mealsFor } from "./meals";
import { timeKey } from "./pure";
import { findDuplicates, mealRows, placeByTime, planSync, supplierRows, type DerivedRow } from "./runsheet-pure";
import { suppliersFor } from "./suppliers";

export type TabKind = "schedule" | "list" | "seating" | "packing" | "photos" | "guests" | "styling";

export interface RunsheetTab {
  id: string;
  title: string;
  kind: TabKind;
  position: number;
}

export interface RunsheetRow {
  id: string;
  tab_id: string;
  at_time: string;
  who: string;
  people: string[];
  what: string;
  info: string;
  location: string;
  rain_location: string;
  position: number;
  by_admin: boolean;
  created_by_name: string;
  /** Rows from Eten en allergieën or Leveranciers: time and text change there only. */
  source: string | null;
  source_id: string | null;
}

export interface Person {
  id: string;
  name: string;
  color: string;
}

/** Soft colours in the house style; a new name picks one of these. */
export const PALETTE = ["#E8C9CF", "#D9E4CF", "#F1E3C4", "#CFDDE6", "#E6D5EA", "#F3D6C4", "#DCD3C2", "#C9E2DD", "#EAD9C8", "#D7D3E8"];

export const TAB_KINDS: Record<TabKind, string> = {
  schedule: "Tijdlijn",
  list: "Lijst",
  seating: "Opstelling",
  packing: "Meeneemlijst",
  photos: "Groepsfoto's",
  guests: "Gastenlijst",
  styling: "Stylingplan",
};

export const tabsFor = (coupleId: string) =>
  query<RunsheetTab>("select id, title, kind, position from runsheet_tabs where couple_id = $1 order by position, title", [coupleId]);

/** New couples: the stored tabs in Sabine's order (Leveranciers and Eten & allergieën are added when shown). */
export const DEFAULT_TABS: [string, TabKind][] = [
  ["Dagplanning", "schedule"], ["Gastenlijst", "guests"], ["Groepsfoto's", "photos"], ["Stylingplan", "styling"], ["Opstelling", "seating"], ["Meeneemlijst", "packing"],
];


export async function rowsFor(coupleId: string, tabId?: string): Promise<RunsheetRow[]> {
  return query<RunsheetRow>(
    `select * from runsheet_rows where couple_id = $1 and ($2::uuid is null or tab_id = $2) order by position, created_at`,
    [coupleId, tabId ?? null],
  );
}

export const peopleFor = (coupleId: string) =>
  query<Person>("select id, name, color from couple_people where couple_id = $1 order by position, name", [coupleId]);

/** Only for printing old data: a time line in time order. */
export const sortSchedule = (rows: RunsheetRow[]) => [...rows].sort((a, b) => timeKey(a.at_time) - timeKey(b.at_time) || a.position - b.position);

/** The "Leveranciers" tab is filled from "Jullie leveranciers": entered once, shown here. */
export async function supplierContacts(coupleId: string) {
  return (await suppliersFor(coupleId)).filter((s) => s.name || s.contact_person || s.phone || s.email || s.present_from || s.present_until);
}

/** The time line that gets the rows from Eten en allergieën and Leveranciers: the first one. */
export const planningTab = async (coupleId: string) =>
  (await query<{ id: string }>("select id from runsheet_tabs where couple_id = $1 and kind = 'schedule' order by position, title limit 1", [coupleId]))[0] ?? null;

async function derivedFor(coupleId: string): Promise<DerivedRow[]> {
  const [{ moments, totals }, suppliers] = await Promise.all([
    mealsFor(coupleId),
    query<{ id: string; name: string; category_name: string; status: string; present_from: string; present_until: string }>(
      `select s.id, s.name, c.name as category_name, s.status, s.present_from, s.present_until
         from couple_suppliers s join supplier_categories c on c.id = s.category_id
        where s.couple_id = $1 and not c.archived and (s.present_from <> '' or s.present_until <> '')
        order by c.couple_id nulls first, c.position, c.name, s.position, s.created_at`,
      [coupleId],
    ),
  ]);
  return [...mealRows(moments, totals), ...supplierRows(suppliers)];
}

/**
 * Brings the day planning in line with the meal moments and the suppliers'
 * times: one row per moment or arrival/departure, never twice. Runs when a
 * source is saved and when the day planning opens. Returns the typed rows
 * that look like one of them (shown, never removed).
 */
export async function syncDerivedRows(coupleId: string): Promise<{ id: string; label: string; what: string }[]> {
  const tab = await planningTab(coupleId);
  if (!tab) return [];
  const desired = await derivedFor(coupleId);
  const before = await query<{ id: string; at_time: string; what: string; source: string | null; source_id: string | null }>(
    "select id, at_time, what, source, source_id from runsheet_rows where couple_id = $1 and (tab_id = $2 or source is not null) order by position, created_at",
    [coupleId, tab.id],
  );
  const plan = planSync(before, desired);
  if (plan.insert.length || plan.update.length || plan.remove.length || plan.place.length) {
    await tx(async (db) => {
      if (plan.remove.length) await query("delete from runsheet_rows where couple_id = $1 and id = any($2::uuid[])", [coupleId, plan.remove], db);
      for (const u of plan.update) await query("update runsheet_rows set at_time = $2, what = $3 where id = $1", [u.id, u.at_time, u.what], db);
      for (const d of plan.insert) {
        // The unique index keeps it single when two syncs run at the same time.
        await query(
          `insert into runsheet_rows (couple_id, tab_id, at_time, what, source, source_id, created_by_name, position)
           values ($1, $2, $3, $4, $5, $6, '', (select coalesce(max(position), 0) + 1 from runsheet_rows where tab_id = $2))
           on conflict do nothing`,
          [coupleId, tab.id, d.at_time, d.what, d.source, d.source_id],
          db,
        );
      }
      const rows = await query<{ id: string; at_time: string; source: string | null; source_id: string | null }>(
        "select id, at_time, source, source_id from runsheet_rows where tab_id = $1 order by position, created_at for update",
        [tab.id],
        db,
      );
      const ids = plan.place
        .map((p) => p.id ?? rows.find((r) => r.source === p.source && r.source_id === p.source_id)?.id)
        .filter((id): id is string => Boolean(id));
      const order = placeByTime(rows, ids);
      if (order.some((id, i) => rows[i]?.id !== id)) {
        for (let i = 0; i < order.length; i++) await query("update runsheet_rows set position = $2 where id = $1", [order[i], i + 1], db);
      }
    });
  }
  const typed = before.filter((r) => !r.source);
  return findDuplicates(typed, desired);
}

/** After a source was saved: never fails the save itself. */
export async function syncAfterSave(coupleId: string) {
  await syncDerivedRows(coupleId).catch((err) => console.error(`[draaiboek] ${(err as Error).message}`));
}
