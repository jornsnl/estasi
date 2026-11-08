import { indexForTime, timeKey } from "./pure";

/**
 * Pure parts of the draaiboek: the order of the tabs, and the day planning
 * rows that come from another part of the portal (meal moments, suppliers).
 */

// Tab order ---------------------------------------------------------------------------------------

/** Sabine's order. "suppliers" and "meals" are not stored tabs: they show what is filled in elsewhere. */
export const TAB_ORDER = ["schedule", "guests", "suppliers", "photos", "meals", "styling", "seating", "packing"] as const;
export type ShownTabKind = (typeof TAB_ORDER)[number] | "list";

export interface ShownTab {
  id: string;
  title: string;
  kind: string;
  position: number;
}

export const VIRTUAL_TABS = {
  suppliers: { id: "leveranciers", title: "Leveranciers", kind: "suppliers", position: 0 },
  meals: { id: "eten", title: "Eten & allergieën", kind: "meals", position: 0 },
} as const;

/**
 * The stored tabs in their own order, with "Leveranciers" after the guest
 * list and "Eten & allergieën" after the group photos (at the end when that
 * tab is gone). Tabs Sabine added herself stay where she put them.
 */
export function withVirtualTabs<T extends ShownTab>(tabs: T[]): (T | (typeof VIRTUAL_TABS)[keyof typeof VIRTUAL_TABS])[] {
  const out: (T | (typeof VIRTUAL_TABS)[keyof typeof VIRTUAL_TABS])[] = [...tabs];
  const place = (after: string, tab: (typeof VIRTUAL_TABS)[keyof typeof VIRTUAL_TABS]) => {
    const i = out.findIndex((t) => t.kind === after);
    if (i === -1) out.push(tab);
    else out.splice(i + 1, 0, tab);
  };
  place("guests", VIRTUAL_TABS.suppliers);
  place("photos", VIRTUAL_TABS.meals);
  return out;
}

// Rows from elsewhere -----------------------------------------------------------------------------

export type RowSource = "meal" | "supplier_from" | "supplier_until";

export const SOURCE_LABEL: Record<RowSource, string> = {
  meal: "uit Eten en allergieën",
  supplier_from: "uit Leveranciers",
  supplier_until: "uit Leveranciers",
};

export const isRowSource = (value: unknown): value is RowSource => typeof value === "string" && value in SOURCE_LABEL;

export interface DerivedRow {
  source: RowSource;
  source_id: string;
  at_time: string;
  what: string;
  /** The name a typed row would contain if it is the same thing ("Diner", "Studio Licht"). */
  match: string;
}

export interface MomentSource {
  id: string;
  name: string;
  active: boolean;
  at_time: string;
}

export interface SupplierSource {
  id: string;
  name: string;
  category_name: string;
  status: string;
  present_from: string;
  present_until: string;
}

const hasTime = (value: string) => timeKey(value ?? "") !== Number.MAX_SAFE_INTEGER;

/** "18:30 Diner, 86 personen": every active meal moment with a time. */
export function mealRows(moments: MomentSource[], totals: Record<string, number>): DerivedRow[] {
  return moments
    .filter((m) => m.active && m.name.trim() && hasTime(m.at_time))
    .map((m) => {
      const n = totals[m.id] ?? 0;
      return {
        source: "meal" as const,
        source_id: m.id,
        at_time: m.at_time.trim(),
        what: n > 0 ? `${m.name.trim()}, ${n} ${n === 1 ? "persoon" : "personen"}` : m.name.trim(),
        match: m.name.trim(),
      };
    });
}

/** "13:30 Aankomst Studio Licht (Fotograaf)" and "23:45 Vertrek ...", for every supplier with a time (not "Niet nodig"). */
export function supplierRows(suppliers: SupplierSource[]): DerivedRow[] {
  const out: DerivedRow[] = [];
  for (const s of suppliers) {
    if (s.status === "not_needed") continue;
    const name = s.name.trim();
    const label = name ? `${name} (${s.category_name})` : s.category_name;
    const match = name || s.category_name;
    if (hasTime(s.present_from)) out.push({ source: "supplier_from", source_id: s.id, at_time: s.present_from.trim(), what: `Aankomst ${label}`, match });
    if (hasTime(s.present_until)) out.push({ source: "supplier_until", source_id: s.id, at_time: s.present_until.trim(), what: `Vertrek ${label}`, match });
  }
  return out;
}

export interface ExistingRow {
  id: string;
  at_time: string;
  what: string;
  source: string | null;
  source_id: string | null;
}

export interface SyncPlan {
  insert: DerivedRow[];
  update: { id: string; at_time: string; what: string }[];
  remove: string[];
  /** Rows (new, or with a new time) that go to their place in the time line. */
  place: { id?: string; source: RowSource; source_id: string }[];
}

const keyOf = (source: string, sourceId: string) => `${source}:${sourceId}`;

/**
 * What to change so the day planning holds exactly one row per derived row:
 * a row whose source or time is gone goes, a changed time or name is
 * updated (the notes in the row stay), a missing one is added.
 */
export function planSync(existing: ExistingRow[], desired: DerivedRow[]): SyncPlan {
  const wanted = new Map(desired.map((d) => [keyOf(d.source, d.source_id), d]));
  const seen = new Set<string>();
  const plan: SyncPlan = { insert: [], update: [], remove: [], place: [] };
  for (const row of existing) {
    if (!row.source || !row.source_id) continue;
    const key = keyOf(row.source, row.source_id);
    const want = wanted.get(key);
    if (!want || seen.has(key)) {
      plan.remove.push(row.id);
      continue;
    }
    seen.add(key);
    if (row.at_time !== want.at_time || row.what !== want.what) plan.update.push({ id: row.id, at_time: want.at_time, what: want.what });
    if (timeKey(row.at_time) !== timeKey(want.at_time)) plan.place.push({ id: row.id, source: want.source, source_id: want.source_id });
  }
  for (const [key, want] of wanted) {
    if (seen.has(key)) continue;
    plan.insert.push(want);
    plan.place.push({ source: want.source, source_id: want.source_id });
  }
  return plan;
}

/** The order of the rows after the given ones moved to their time (the rest stays where it is). */
export function placeByTime(rows: { id: string; at_time: string }[], ids: string[]): string[] {
  let order = [...rows];
  for (const id of ids) {
    const row = order.find((r) => r.id === id);
    if (!row) continue;
    const to = indexForTime(order, id, row.at_time);
    order = order.filter((r) => r.id !== id);
    order.splice(to, 0, row);
  }
  return order.map((r) => r.id);
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Typed rows that look like a derived one (same time, and its name in the
 * text): shown as "mogelijk dubbel", never removed automatically.
 */
export function findDuplicates(rows: ExistingRow[], desired: DerivedRow[]): { id: string; label: string; what: string }[] {
  const out: { id: string; label: string; what: string }[] = [];
  for (const row of rows) {
    if (row.source) continue;
    const key = timeKey(row.at_time);
    if (key === Number.MAX_SAFE_INTEGER) continue;
    const text = norm(row.what);
    const hit = desired.find((d) => timeKey(d.at_time) === key && d.match && text.includes(norm(d.match)));
    if (hit) out.push({ id: row.id, label: SOURCE_LABEL[hit.source], what: `${hit.at_time} ${hit.what}` });
  }
  return out;
}

/** "13:30", "9.05" or "" (empty clears the time); anything else is refused. */
export function cleanTime(value: string): string | null {
  const v = String(value ?? "").trim();
  if (!v) return "";
  const m = v.match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}
