import "server-only";
import { one, query } from "./db";
import type { RowSeats } from "./seating-geometry";
import type { ObjectKind } from "./seating-moves";

export interface Layout {
  id: string;
  kind: "dinner" | "ceremony";
  name: string;
  group_ids: string[];
  shape: "rows" | "half" | "circle";
  rows: number;
  seats_per_row: number;
  /** Rows with an aisle: chairs per row and side. */
  row_seats: RowSeats[];
  side_left: string;
  side_right: string;
}

export interface SeatingState {
  layout: Layout;
  tables: { id: string; shape: "round" | "square" | "long"; name: string; x: number; y: number; rotation: number; seats: number; long_sides: "both" | "one"; head_seats: boolean }[];
  /** Chairs with a guest, a typed name or an object on them. */
  seats: { seat_key: string; guest_id: string | null; name: string; object_id: string | null }[];
  /**
   * Objects on the plan: a styling item from the styling plan (styling_item_id),
   * an own styling object or a ceremony element. On a chair when a seat points
   * to it, otherwise loose at x, y.
   */
  blocks: { id: string; styling_item_id: string | null; kind: ObjectKind; name: string; what: string; x: number; y: number }[];
  /** Guests of the chosen groups who are coming (for dinner: not those who skip the dinner). */
  candidates: { id: string; name: string; relation: string; diet: string; partial: string; group: string }[];
  /** Everyone, to recognise typed names. */
  everyone: { id: string; name: string; attending: boolean }[];
  /** Styling items of the place Ceremoniezaal or Diner. */
  styling: { id: string; what: string }[];
}

export const layoutsFor = (coupleId: string) =>
  query<Layout>("select * from seating_layouts where couple_id = $1 order by position, created_at", [coupleId]);

export async function seatingState(coupleId: string, layoutId: string): Promise<SeatingState | null> {
  const layout = await one<Layout>("select * from seating_layouts where id = $1 and couple_id = $2", [layoutId, coupleId]);
  if (!layout) return null;
  const [tables, seats, blocks, candidates, everyone, styling] = await Promise.all([
    query<SeatingState["tables"][number]>("select id, shape, name, x, y, rotation, seats, long_sides, head_seats from seating_tables where layout_id = $1 order by created_at", [layout.id]),
    query<SeatingState["seats"][number]>("select seat_key, guest_id, name, object_id from seating_seats where layout_id = $1", [layout.id]),
    query<SeatingState["blocks"][number]>(
      `select b.id, b.styling_item_id, b.kind, b.name, coalesce(i.what, b.name) as what, b.x, b.y
         from seating_blocks b left join styling_items i on i.id = b.styling_item_id where b.layout_id = $1 order by b.created_at`,
      [layout.id],
    ),
    query<SeatingState["candidates"][number]>(
      `select g.id, trim(g.first_name || ' ' || g.last_name) as name, coalesce(nullif(g.relation_note, ''), g.relation) as relation, g.diet,
              case when g.attendance = 'partial' then coalesce(nullif(g.partial_note, ''), 'Deel van de dag') else '' end as partial,
              coalesce(gg.name, '') as "group"
         from guests g left join guest_groups gg on gg.id = g.group_id
        where g.couple_id = $1 and g.attendance <> 'no'
          -- Everyone of one sign-up (Jan + 4 children) counts, also the ones without a group of their own:
          -- they go with the group of whoever signed them up.
          and (g.group_id = any($2::uuid[])
               or (g.group_id is null and g.response_id is not null and exists (
                     select 1 from guests o where o.couple_id = g.couple_id and o.response_id = g.response_id and o.group_id = any($2::uuid[]))))
          and not ($3 and exists (
                select 1 from guest_meal_exclusions e join meal_moments m on m.id = e.moment_id
                 where e.guest_id = g.id and m.name ilike 'diner%'))
        order by gg.position, g.created_at`,
      [coupleId, layout.group_ids, layout.kind === "dinner"],
    ),
    query<SeatingState["everyone"][number]>(
      "select id, trim(first_name || ' ' || last_name) as name, attendance <> 'no' as attending from guests where couple_id = $1",
      [coupleId],
    ),
    query<SeatingState["styling"][number]>(
      `select i.id, i.what from styling_items i join styling_places p on p.id = i.place_id
        where i.couple_id = $1 and not i.draft and p.name ilike $2 order by i.position`,
      [coupleId, layout.kind === "dinner" ? "diner%" : "ceremonie%"],
    ),
  ]);
  return { layout, tables, seats, blocks, candidates, everyone, styling };
}
