import "server-only";
import { query } from "./db";
import { mealTotal, rsvpRowCount } from "./guest-counts";
import { dietSummary } from "./pure";
import { groupsOf } from "./rsvp";

export interface MealMoment {
  id: string;
  name: string;
  active: boolean;
  at_time: string;
  caterer: string;
  menu: string;
  updated_by_name: string;
  updated_at: Date | null;
}

export interface MealRow {
  id: string;
  kind: "person" | "group" | "rsvp";
  name: string;
  role: string;
  group_id: string | null;
  kids: boolean;
  /** RSVP rows: the kind of guest group, so "Deel van de dag" can sit right under the day guests. */
  group_kind: "day" | "evening" | "custom" | null;
  diet: string;
  /** moment id → ticked (person, or RSVP row on) and number (group, or the RSVP count). */
  cells: Record<string, { checked: boolean; count: number }>;
  /** RSVP rows: the diet summary of these guests. */
  summary: string;
  /** A supplier that eats along (Leveranciers, "Eet mee"). */
  supplier_id?: string | null;
}

export interface MealGuest {
  id: string;
  name: string;
  group: string;
  group_id: string | null;
  is_kid: boolean;
  diet: string;
  attendance: string;
  partial_note: string;
  meals_reviewed: boolean;
  excluded: string[];
}

/** Everything for "Eten en allergieën"; RSVP rows exist for every guest group, adults and children. */
export async function mealsFor(coupleId: string) {
  const groups = await groupsOf(coupleId);
  for (const g of groups) {
    await query(
      `insert into meal_rows (couple_id, kind, name, group_id, kids, position)
       values ($1, 'rsvp', $2, $3, false, 1000 + $5 * 2), ($1, 'rsvp', $4, $3, true, 1001 + $5 * 2)
       on conflict do nothing`,
      [coupleId, `${g.name} volwassenen`, g.id, `${g.name} kinderen`, g.position],
    );
  }
  const [moments, rows, cells, guests, exclusions] = await Promise.all([
    query<MealMoment>("select id, name, active, at_time, caterer, menu, updated_by_name, updated_at from meal_moments where couple_id = $1 order by position", [coupleId]),
    query<Omit<MealRow, "cells" | "summary">>(
      // A supplier that eats along (feedback Sabine 21) keeps the name and category it has on Leveranciers.
      `select r.id, r.kind,
              case when r.kind = 'rsvp' then g.name || case when r.kids then ' kinderen' else ' volwassenen' end
                   when r.supplier_id is not null then coalesce(nullif(s.name, ''), sc.name, r.name)
                   else r.name end as name,
              case when r.supplier_id is not null then coalesce(sc.name, r.role) else r.role end as role,
              r.group_id, r.kids, g.kind as group_kind, r.diet, r.supplier_id
         from meal_rows r left join guest_groups g on g.id = r.group_id
         left join couple_suppliers s on s.id = r.supplier_id
         left join supplier_categories sc on sc.id = s.category_id
        where r.couple_id = $1 order by case r.kind when 'person' then 0 when 'group' then 1 else 2 end, r.position, r.created_at`,
      [coupleId],
    ),
    query<{ row_id: string; moment_id: string; checked: boolean; count: number }>(
      "select c.* from meal_cells c join meal_rows r on r.id = c.row_id where r.couple_id = $1",
      [coupleId],
    ),
    query<Omit<MealGuest, "excluded">>(
      `select g.id, trim(g.first_name || ' ' || g.last_name) as name, coalesce(gg.name, 'Zonder groep') as "group", g.group_id, g.is_kid, g.diet,
              g.attendance, g.partial_note, g.meals_reviewed
         from guests g left join guest_groups gg on gg.id = g.group_id
        where g.couple_id = $1 and g.attendance <> 'no' order by gg.position nulls last, g.created_at`,
      [coupleId],
    ),
    query<{ guest_id: string; moment_id: string }>(
      "select e.* from guest_meal_exclusions e join guests g on g.id = e.guest_id where g.couple_id = $1",
      [coupleId],
    ),
  ]);
  const mealGuests: MealGuest[] = guests.map((g) => ({ ...g, excluded: exclusions.filter((e) => e.guest_id === g.id).map((e) => e.moment_id) }));

  const full: MealRow[] = rows.map((r) => {
    const own = Object.fromEntries(cells.filter((c) => c.row_id === r.id).map((c) => [c.moment_id, { checked: c.checked, count: c.count }]));
    if (r.kind !== "rsvp") return { ...r, cells: own, summary: "" };
    // Guests there part of the day are in their own rows ("Deel van de dag"), not in the group.
    const members = mealGuests.filter((g) => g.group_id === r.group_id && g.is_kid === r.kids && g.attendance === "yes");
    const auto = Object.fromEntries(moments.map((m) => [m.id, { checked: own[m.id]?.checked ?? false, count: rsvpRowCount(mealGuests, r, m.id) }]));
    return { ...r, cells: auto, summary: dietSummary(members.map((g) => g.diet)) };
  });
  // Totals per moment: people ticked, group numbers, RSVP groups that are on, partial guests ticked.
  const totals = Object.fromEntries(moments.map((m) => [m.id, mealTotal(full, mealGuests, m.id)]));
  return { moments, rows: full, guests: mealGuests, partial: mealGuests.filter((g) => g.attendance === "partial"), totals, groups };
}
