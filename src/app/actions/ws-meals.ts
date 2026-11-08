"use server";

import { requireOwner } from "@/lib/auth/session";
import { requireCouple, type CoupleContext } from "@/lib/ws/access";
import { logActivity } from "@/lib/ws/couples";
import { isUuid, one, query } from "@/lib/ws/db";
import { moveRow } from "@/lib/ws/order";
import { done, str } from "@/lib/ws/redirect";
import { syncAfterSave } from "@/lib/ws/runsheet";

/**
 * Eten en allergieën. Sabine and the couple can both do everything for the
 * couple; Sabine alone manages the standard moments. RSVP numbers and the
 * RSVP allergy list are never typed in: exceptions go per guest.
 */

type Ok = { ok: boolean; error?: string };
const page = (ctx: CoupleContext, anchor = "") => `/k/${ctx.couple.id}/eten${anchor}`;
async function ctxOf(coupleId: string) {
  const ctx = await requireCouple(coupleId);
  return ctx.planning ? ctx : null;
}
async function note(ctx: CoupleContext, action: string) {
  if (!ctx.isAdmin) await logActivity(ctx.couple.id, ctx.account.id, action);
}
const who = (ctx: CoupleContext) => (ctx.isAdmin ? "Sabine" : ctx.account.name.split(" ")[0]);

// Moments ------------------------------------------------------------------------------------------

export async function updateMoment(
  coupleId: string,
  momentId: string,
  change: { name?: string; active?: boolean; at_time?: string; caterer?: string; menu?: string },
): Promise<Ok & { by?: string }> {
  const ctx = await ctxOf(coupleId);
  if (!ctx || !isUuid(momentId)) return { ok: false, error: "Niet gevonden." };
  const m = await one("select 1 from meal_moments where id = $1 and couple_id = $2", [momentId, ctx.couple.id]);
  if (!m) return { ok: false, error: "Niet gevonden." };
  if (change.name !== undefined) {
    const name = String(change.name).trim().slice(0, 80);
    if (!name) return { ok: false, error: "Geef het eetmoment een naam." };
    await query("update meal_moments set name = $2 where id = $1", [momentId, name]);
  }
  if (change.active !== undefined) await query("update meal_moments set active = $2 where id = $1", [momentId, Boolean(change.active)]);
  if (change.at_time !== undefined) await query("update meal_moments set at_time = $2 where id = $1", [momentId, String(change.at_time).trim().slice(0, 20)]);
  if (change.caterer !== undefined || change.menu !== undefined) {
    await query(
      `update meal_moments set caterer = coalesce($2, caterer), menu = coalesce($3, menu), updated_by_name = $4, updated_at = now() where id = $1`,
      [momentId, change.caterer === undefined ? null : String(change.caterer).trim().slice(0, 200), change.menu === undefined ? null : String(change.menu).slice(0, 10_000), who(ctx)],
    );
    await note(ctx, "Eten bijgewerkt");
  }
  // A moment with a time is a row in the day planning.
  if (change.name !== undefined || change.active !== undefined || change.at_time !== undefined) await syncAfterSave(ctx.couple.id);
  return { ok: true, by: who(ctx) };
}

export async function addMoment(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  const name = str(formData, "name", 80);
  if (!name) done(page(ctx, "#momenten"), "Geef het eetmoment een naam.", true);
  await query(
    "insert into meal_moments (couple_id, name, position) values ($1, $2, (select coalesce(max(position), 0) + 1 from meal_moments where couple_id = $1))",
    [ctx.couple.id, name],
  );
  done(page(ctx, "#momenten"), `Eetmoment "${name}" toegevoegd.`);
}

export async function moveMoment(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  const id = str(formData, "id", 40);
  if (isUuid(id)) await moveRow("meal_moments", id, ctx.couple.id, str(formData, "direction") === "up" ? "up" : "down");
  done(page(ctx, "#momenten"), "Volgorde aangepast.");
}

// Rows -----------------------------------------------------------------------------------------------

export async function addMealRow(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  const kind = str(formData, "kind") === "group" ? "group" : "person";
  const name = str(formData, "name", 120);
  if (!name) done(page(ctx, "#tabel"), "Vul een naam in.", true);
  await query(
    `insert into meal_rows (couple_id, kind, name, role, position)
     values ($1, $2, $3, $4, (select coalesce(max(position), 0) + 1 from meal_rows where couple_id = $1 and kind = $2))`,
    [ctx.couple.id, kind, name, str(formData, "role", 120)],
  );
  await note(ctx, "Eten bijgewerkt");
  await syncAfterSave(ctx.couple.id);
  done(page(ctx, "#tabel"), `${name} toegevoegd.`);
}

export async function updateMealRow(coupleId: string, rowId: string, change: { name?: string; role?: string; diet?: string }): Promise<Ok> {
  const ctx = await ctxOf(coupleId);
  if (!ctx || !isUuid(rowId)) return { ok: false, error: "Niet gevonden." };
  const row = await one<{ kind: string }>("select kind from meal_rows where id = $1 and couple_id = $2", [rowId, ctx.couple.id]);
  if (!row || row.kind === "rsvp") return { ok: false, error: "Deze regel komt uit de RSVP." };
  if (change.name !== undefined && String(change.name).trim()) await query("update meal_rows set name = $2 where id = $1", [rowId, String(change.name).trim().slice(0, 120)]);
  if (change.role !== undefined) await query("update meal_rows set role = $2 where id = $1", [rowId, String(change.role).trim().slice(0, 120)]);
  if (change.diet !== undefined) await query("update meal_rows set diet = $2 where id = $1", [rowId, String(change.diet).trim().slice(0, 500)]);
  return { ok: true };
}

export async function deleteMealRow(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  const id = str(formData, "rowId", 40);
  if (isUuid(id)) await query("delete from meal_rows where id = $1 and couple_id = $2 and kind <> 'rsvp'", [id, ctx.couple.id]);
  await syncAfterSave(ctx.couple.id);
  done(page(ctx, "#tabel"), "Verwijderd.");
}

/** A cell: tick (person, or RSVP group on/off) or a number (own group). */
export async function setMealCell(coupleId: string, rowId: string, momentId: string, value: { checked?: boolean; count?: number }): Promise<Ok> {
  const ctx = await ctxOf(coupleId);
  if (!ctx || !isUuid(rowId) || !isUuid(momentId)) return { ok: false, error: "Niet gevonden." };
  const ok = await one(
    "select 1 from meal_rows r join meal_moments m on m.couple_id = r.couple_id where r.id = $1 and m.id = $2 and r.couple_id = $3",
    [rowId, momentId, ctx.couple.id],
  );
  if (!ok) return { ok: false, error: "Niet gevonden." };
  const count = Math.max(0, Math.min(2000, Math.round(Number(value.count ?? 0)) || 0));
  await query(
    `insert into meal_cells (row_id, moment_id, checked, count) values ($1, $2, $3, $4)
     on conflict (row_id, moment_id) do update set checked = coalesce($5, meal_cells.checked), count = coalesce($6, meal_cells.count)`,
    [rowId, momentId, Boolean(value.checked), count, value.checked === undefined ? null : Boolean(value.checked), value.count === undefined ? null : count],
  );
  // The number of people in the day planning row.
  await syncAfterSave(ctx.couple.id);
  return { ok: true };
}

/** A guest there for part of the day: eats along at this moment or not. */
export async function setGuestMeal(coupleId: string, guestId: string, momentId: string | null, eats: boolean): Promise<Ok> {
  const ctx = await ctxOf(coupleId);
  if (!ctx || !isUuid(guestId)) return { ok: false, error: "Niet gevonden." };
  const guest = await one("select 1 from guests where id = $1 and couple_id = $2", [guestId, ctx.couple.id]);
  if (!guest) return { ok: false, error: "Niet gevonden." };
  if (momentId) {
    if (!isUuid(momentId) || !(await one("select 1 from meal_moments where id = $1 and couple_id = $2", [momentId, ctx.couple.id]))) return { ok: false, error: "Niet gevonden." };
    if (eats) await query("delete from guest_meal_exclusions where guest_id = $1 and moment_id = $2", [guestId, momentId]);
    else await query("insert into guest_meal_exclusions (guest_id, moment_id) values ($1, $2) on conflict do nothing", [guestId, momentId]);
  }
  await query("update guests set meals_reviewed = true where id = $1", [guestId]);
  await syncAfterSave(ctx.couple.id);
  return { ok: true };
}

// Standard moments (Sabine) ------------------------------------------------------------------------------

export async function saveDefaultMoments(formData: FormData) {
  await requireOwner();
  const names = [...new Set(str(formData, "moments", 3000).split("\n").map((l) => l.trim().slice(0, 80)).filter(Boolean))].slice(0, 30);
  await query("delete from default_meal_moments");
  for (const [i, name] of names.entries()) await query("insert into default_meal_moments (name, position) values ($1, $2)", [name, i + 1]);
  done("/beheer/bruidsparen/standaardlijsten#eetmomenten", "Eetmomenten opgeslagen. Geldt voor nieuwe bruidsparen.");
}
