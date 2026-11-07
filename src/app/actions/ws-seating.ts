"use server";

import { requireCouple, requireCoupleAdmin, type CoupleContext } from "@/lib/ws/access";
import { logActivity } from "@/lib/ws/couples";
import { isUuid, one, query } from "@/lib/ws/db";
import { done, str } from "@/lib/ws/redirect";
import { seatingState, type SeatingState } from "@/lib/ws/seating";

/**
 * Opstelling. Sabine makes the plans (shape, guest groups, tables); the
 * couple and Sabine place guests, typed names and styling blocks.
 */

type Result = { ok: true; state: SeatingState } | { ok: false; error: string };
const tab = (ctx: CoupleContext, layoutId?: string) => `/k/${ctx.couple.id}/draaiboek?soort=seating${layoutId ? `&opstelling=${layoutId}` : ""}`;

async function layoutOf(ctx: CoupleContext, layoutId: string) {
  if (!isUuid(layoutId)) return null;
  return one<{ id: string; kind: string }>("select id, kind from seating_layouts where id = $1 and couple_id = $2", [layoutId, ctx.couple.id]);
}
async function result(ctx: CoupleContext, layoutId: string): Promise<Result> {
  const state = await seatingState(ctx.couple.id, layoutId);
  return state ? { ok: true, state } : { ok: false, error: "Opstelling niet gevonden." };
}
const clampPct = (v: unknown) => Math.max(2, Math.min(98, Number(v) || 50));

// Plans (Sabine) -------------------------------------------------------------------------------------

async function groupIds(ctx: CoupleContext, formData: FormData) {
  const wanted = formData.getAll("groupIds").map(String).filter(isUuid);
  if (wanted.length === 0) return [];
  const rows = await query<{ id: string }>("select id from guest_groups where couple_id = $1 and id = any($2::uuid[])", [ctx.couple.id, wanted]);
  return rows.map((r) => r.id);
}
const int = (formData: FormData, name: string, fallback: number) => Math.max(1, Math.min(40, Math.round(Number(str(formData, name, 4))) || fallback));

export async function saveLayout(formData: FormData) {
  const ctx = await requireCoupleAdmin(str(formData, "coupleId", 40));
  const layoutId = str(formData, "layoutId", 40);
  if (formData.get("intent") === "delete" && isUuid(layoutId)) {
    await query("delete from seating_layouts where id = $1 and couple_id = $2", [layoutId, ctx.couple.id]);
    done(tab(ctx), "Opstelling verwijderd.");
  }
  const kind = str(formData, "kind") === "ceremony" ? "ceremony" : "dinner";
  const shape = ["rows", "half", "circle"].includes(str(formData, "shape")) ? str(formData, "shape") : "rows";
  const values = [
    str(formData, "name", 80) || (kind === "dinner" ? "Dineropstelling" : "Ceremonieopstelling"), await groupIds(ctx, formData), shape,
    int(formData, "rows", 6), int(formData, "seatsPerRow", 6), str(formData, "sideLeft", 60), str(formData, "sideRight", 60),
  ];
  if (isUuid(layoutId)) {
    await query(
      `update seating_layouts set name = $3, group_ids = $4, shape = $5, rows = $6, seats_per_row = $7, side_left = $8, side_right = $9
        where id = $1 and couple_id = $2`,
      [layoutId, ctx.couple.id, ...values],
    );
    done(tab(ctx, layoutId), "Opstelling opgeslagen.");
  }
  const row = await one<{ id: string }>(
    `insert into seating_layouts (couple_id, kind, name, group_ids, shape, rows, seats_per_row, side_left, side_right, position)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, (select coalesce(max(position), 0) + 1 from seating_layouts where couple_id = $1)) returning id`,
    [ctx.couple.id, kind, ...values],
  );
  done(tab(ctx, row!.id), kind === "dinner" ? "Dineropstelling gemaakt. Voeg tafels toe." : "Ceremonieopstelling gemaakt.");
}

// Tables (Sabine) -------------------------------------------------------------------------------------

export async function addTable(coupleId: string, layoutId: string, shape: "round" | "square" | "long"): Promise<Result> {
  const ctx = await requireCoupleAdmin(coupleId);
  const layout = await layoutOf(ctx, layoutId);
  if (!layout || layout.kind !== "dinner") return { ok: false, error: "Niet gevonden." };
  const count = (await one<{ n: number }>("select count(*)::int as n from seating_tables where layout_id = $1", [layout.id]))!.n;
  await query(
    "insert into seating_tables (layout_id, shape, name, x, y, seats) values ($1, $2, $3, $4, $5, $6)",
    // A grid of three across, so a new table does not land on an existing one.
    [layout.id, ["round", "square", "long"].includes(shape) ? shape : "round", `Tafel ${count + 1}`, 18 + (count % 3) * 32, 22 + (Math.floor(count / 3) % 3) * 30, shape === "long" ? 10 : shape === "square" ? 4 : 8],
  );
  return result(ctx, layout.id);
}

export async function updateTable(
  coupleId: string,
  tableId: string,
  change: { x?: number; y?: number; rotation?: number; seats?: number; name?: string; long_sides?: string; head_seats?: boolean; duplicate?: boolean; remove?: boolean },
): Promise<Result> {
  const ctx = await requireCoupleAdmin(coupleId);
  if (!isUuid(tableId)) return { ok: false, error: "Niet gevonden." };
  const table = await one<{ layout_id: string; seats: number }>(
    "select t.layout_id, t.seats from seating_tables t join seating_layouts l on l.id = t.layout_id where t.id = $1 and l.couple_id = $2",
    [tableId, ctx.couple.id],
  );
  if (!table) return { ok: false, error: "Niet gevonden." };
  if (change.remove) {
    await query("delete from seating_seats where layout_id = $1 and seat_key like $2", [table.layout_id, `t:${tableId}:%`]);
    await query("delete from seating_tables where id = $1", [tableId]);
    return result(ctx, table.layout_id);
  }
  if (change.duplicate) {
    await query(
      `insert into seating_tables (layout_id, shape, name, x, y, rotation, seats, long_sides, head_seats)
       select layout_id, shape, name || ' (kopie)', least(x + 8, 95), least(y + 8, 95), rotation, seats, long_sides, head_seats from seating_tables where id = $1`,
      [tableId],
    );
    return result(ctx, table.layout_id);
  }
  if (change.x !== undefined || change.y !== undefined) await query("update seating_tables set x = coalesce($2, x), y = coalesce($3, y) where id = $1", [tableId, change.x === undefined ? null : clampPct(change.x), change.y === undefined ? null : clampPct(change.y)]);
  if (change.rotation !== undefined) await query("update seating_tables set rotation = $2 where id = $1", [tableId, change.rotation === 90 ? 90 : 0]);
  if (change.name !== undefined) await query("update seating_tables set name = $2 where id = $1", [tableId, String(change.name).trim().slice(0, 60)]);
  if (change.long_sides !== undefined) await query("update seating_tables set long_sides = $2 where id = $1", [tableId, change.long_sides === "one" ? "one" : "both"]);
  if (change.head_seats !== undefined) await query("update seating_tables set head_seats = $2 where id = $1", [tableId, Boolean(change.head_seats)]);
  if (change.seats !== undefined) {
    const seats = Math.max(1, Math.min(60, Math.round(Number(change.seats)) || table.seats));
    await query("update seating_tables set seats = $2 where id = $1", [tableId, seats]);
    // Chairs that no longer exist give their guest back to the list.
    await query("delete from seating_seats where layout_id = $1 and seat_key like $2 and split_part(seat_key, ':', 3)::int >= $3", [table.layout_id, `t:${tableId}:%`, seats]);
  }
  return result(ctx, table.layout_id);
}

// Chairs and blocks (both) --------------------------------------------------------------------------------

/** A chair: a guest from the list, a typed name, or empty again. */
export async function setSeat(coupleId: string, layoutId: string, seatKey: string, value: { guestId?: string | null; name?: string }): Promise<Result> {
  const ctx = await requireCouple(coupleId);
  const layout = ctx.planning ? await layoutOf(ctx, layoutId) : null;
  if (!layout || !/^[A-Za-z]:[\w:-]{1,80}$/.test(seatKey)) return { ok: false, error: "Niet gevonden." };
  const guestId = value.guestId && isUuid(value.guestId) && (await one("select 1 from guests where id = $1 and couple_id = $2", [value.guestId, ctx.couple.id])) ? value.guestId : null;
  const name = String(value.name ?? "").trim().slice(0, 80);
  if (guestId) {
    // A guest sits on one chair per plan.
    await query("delete from seating_seats where layout_id = $1 and guest_id = $2", [layout.id, guestId]);
  }
  if (!guestId && !name) {
    await query("delete from seating_seats where layout_id = $1 and seat_key = $2", [layout.id, seatKey]);
  } else {
    await query(
      `insert into seating_seats (layout_id, seat_key, guest_id, name) values ($1, $2, $3, $4)
       on conflict (layout_id, seat_key) do update set guest_id = excluded.guest_id, name = excluded.name`,
      [layout.id, seatKey, guestId, guestId ? "" : name],
    );
  }
  if (!ctx.isAdmin) await logActivity(ctx.couple.id, ctx.account.id, "Opstelling bijgewerkt");
  return result(ctx, layout.id);
}

/** Moves a placed person to another chair (or swaps with whoever sits there). */
export async function moveSeat(coupleId: string, layoutId: string, from: string, to: string): Promise<Result> {
  const ctx = await requireCouple(coupleId);
  const layout = ctx.planning ? await layoutOf(ctx, layoutId) : null;
  if (!layout || from === to) return layout ? result(ctx, layout.id) : { ok: false, error: "Niet gevonden." };
  const a = await one<{ guest_id: string | null; name: string }>("select guest_id, name from seating_seats where layout_id = $1 and seat_key = $2", [layout.id, from]);
  const b = await one<{ guest_id: string | null; name: string }>("select guest_id, name from seating_seats where layout_id = $1 and seat_key = $2", [layout.id, to]);
  await query("delete from seating_seats where layout_id = $1 and seat_key = any($2::text[])", [layout.id, [from, to]]);
  if (a) await query("insert into seating_seats (layout_id, seat_key, guest_id, name) values ($1, $2, $3, $4)", [layout.id, to, a.guest_id, a.name]);
  if (b) await query("insert into seating_seats (layout_id, seat_key, guest_id, name) values ($1, $2, $3, $4)", [layout.id, from, b.guest_id, b.name]);
  return result(ctx, layout.id);
}

export async function placeBlock(coupleId: string, layoutId: string, stylingItemId: string, x: number, y: number, remove = false): Promise<Result> {
  const ctx = await requireCouple(coupleId);
  const layout = ctx.planning ? await layoutOf(ctx, layoutId) : null;
  if (!layout || !isUuid(stylingItemId)) return { ok: false, error: "Niet gevonden." };
  if (remove) {
    await query("delete from seating_blocks where layout_id = $1 and styling_item_id = $2", [layout.id, stylingItemId]);
  } else if (await one("select 1 from styling_items where id = $1 and couple_id = $2", [stylingItemId, ctx.couple.id])) {
    await query(
      `insert into seating_blocks (layout_id, styling_item_id, x, y) values ($1, $2, $3, $4)
       on conflict (layout_id, styling_item_id) do update set x = excluded.x, y = excluded.y`,
      [layout.id, stylingItemId, clampPct(x), clampPct(y)],
    );
  }
  return result(ctx, layout.id);
}
