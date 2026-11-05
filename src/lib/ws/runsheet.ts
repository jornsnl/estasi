import "server-only";
import { query } from "./db";
import { timeKey } from "./pure";
import { suppliersFor } from "./suppliers";

export interface RunsheetTab {
  id: string;
  title: string;
  kind: "schedule" | "list";
  position: number;
}

export interface RunsheetRow {
  id: string;
  tab_id: string;
  at_time: string;
  who: string;
  what: string;
  info: string;
  location: string;
  rain_location: string;
  position: number;
}

export const tabsFor = (coupleId: string) =>
  query<RunsheetTab>("select id, title, kind, position from runsheet_tabs where couple_id = $1 order by position", [coupleId]);

/** Schedule tabs are shown in time order ("8:30" before "11:00"); lists keep their own order. */
export async function rowsFor(coupleId: string): Promise<RunsheetRow[]> {
  const rows = await query<RunsheetRow>("select * from runsheet_rows where couple_id = $1 order by position, created_at", [coupleId]);
  return rows;
}

export const sortSchedule = (rows: RunsheetRow[]) => [...rows].sort((a, b) => timeKey(a.at_time) - timeKey(b.at_time) || a.position - b.position);

/** The "Leveranciers" tab is filled from "Jullie leveranciers": entered once, shown here (h9.2). */
export async function supplierContacts(coupleId: string) {
  return (await suppliersFor(coupleId)).filter((s) => s.name || s.contact_person || s.phone || s.email);
}
