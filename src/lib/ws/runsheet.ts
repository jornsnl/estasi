import "server-only";
import { query } from "./db";
import { timeKey } from "./pure";
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
  query<RunsheetTab>("select id, title, kind, position from runsheet_tabs where couple_id = $1 order by position", [coupleId]);

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
  return (await suppliersFor(coupleId)).filter((s) => s.name || s.contact_person || s.phone || s.email);
}
