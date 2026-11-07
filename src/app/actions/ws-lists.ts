"use server";

import { requireOwner } from "@/lib/auth/session";
import { requireCouple, type CoupleContext } from "@/lib/ws/access";
import { logActivity } from "@/lib/ws/couples";
import { isUuid, one, query } from "@/lib/ws/db";
import { moveRow } from "@/lib/ws/order";
import { done, str } from "@/lib/ws/redirect";

/** Meeneemlijsten and group photos in the run sheet. */

type Ok = { ok: boolean; error?: string };
const LISTS = ["wedding", "bag", "styling"] as const;
type ListKind = (typeof LISTS)[number];

async function note(ctx: CoupleContext, action: string) {
  if (!ctx.isAdmin) await logActivity(ctx.couple.id, ctx.account.id, action);
}
const tabUrl = (ctx: CoupleContext, kind: string) => `/k/${ctx.couple.id}/draaiboek?soort=${kind}`;

// Packing lists ------------------------------------------------------------------------------------

export async function addPackingItem(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  const list = LISTS.find((l) => l === str(formData, "listKind")) as ListKind | undefined;
  const what = str(formData, "what", 200);
  if (!ctx.planning || !list) done(`/k/${ctx.couple.id}/draaiboek`, "Lijst niet gevonden.", true);
  if (!what) done(tabUrl(ctx, "packing"), "Vul in wat er mee moet.", true);
  const who = str(formData, "who", 120) || [ctx.couple.partner1_first, ctx.couple.partner2_first].filter(Boolean).join(" & ");
  await query(
    `insert into packing_items (couple_id, list_kind, what, who, created_by, position)
     values ($1, $2, $3, $4, $5, (select coalesce(max(position), 0) + 1 from packing_items where couple_id = $1 and list_kind = $2))`,
    [ctx.couple.id, list, what, who, ctx.account.id],
  );
  await note(ctx, "Meeneemlijst bijgewerkt");
  done(`${tabUrl(ctx, "packing")}#lijst-${list}`, "Toegevoegd.");
}

/**
 * From the list itself. "Ingepakt" is for the couple (Sabine sees it but
 * does not tick it); standard items keep their text for the couple.
 */
export async function updatePackingItem(coupleId: string, itemId: string, change: { who?: string; what?: string; packed?: boolean }): Promise<Ok> {
  const ctx = await requireCouple(coupleId);
  if (!ctx.planning || !isUuid(itemId)) return { ok: false, error: "Niet gevonden." };
  const item = await one<{ is_default: boolean }>("select is_default from packing_items where id = $1 and couple_id = $2", [itemId, ctx.couple.id]);
  if (!item) return { ok: false, error: "Niet gevonden." };
  if (change.packed !== undefined) {
    if (ctx.isAdmin) return { ok: false, error: "Het bruidspaar vinkt af wat is ingepakt." };
    await query("update packing_items set packed = $2 where id = $1", [itemId, Boolean(change.packed)]);
  }
  if (change.who !== undefined) await query("update packing_items set who = $2 where id = $1", [itemId, String(change.who).trim().slice(0, 120)]);
  if (change.what !== undefined) {
    if (item.is_default && !ctx.isAdmin) return { ok: false, error: "Standaard items kunnen jullie niet aanpassen." };
    const what = String(change.what).trim().slice(0, 200);
    if (!what) return { ok: false, error: "Mag niet leeg zijn." };
    await query("update packing_items set what = $2 where id = $1", [itemId, what]);
  }
  return { ok: true };
}

export async function deletePackingItem(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  const id = str(formData, "itemId", 40);
  const item = isUuid(id) ? await one<{ is_default: boolean; list_kind: string }>("select is_default, list_kind from packing_items where id = $1 and couple_id = $2", [id, ctx.couple.id]) : null;
  if (!item) done(tabUrl(ctx, "packing"), "Niet gevonden.", true);
  if (item.is_default && !ctx.isAdmin) done(tabUrl(ctx, "packing"), "Standaard items kunnen jullie niet verwijderen.", true);
  await query("delete from packing_items where id = $1", [id]);
  done(`${tabUrl(ctx, "packing")}#lijst-${item.list_kind}`, "Verwijderd.");
}

// Group photos ----------------------------------------------------------------------------------

export async function addGroupPhoto(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  const who = str(formData, "who", 500);
  if (!ctx.planning) done(`/k/${ctx.couple.id}`, "Niet beschikbaar.", true);
  if (!who) done(tabUrl(ctx, "photos"), "Vul in wie er op de foto staan.", true);
  await query(
    `insert into group_photos (couple_id, who, location, position)
     values ($1, $2, $3, (select coalesce(max(position), 0) + 1 from group_photos where couple_id = $1))`,
    [ctx.couple.id, who, str(formData, "location", 200)],
  );
  await note(ctx, "Groepsfoto toegevoegd");
  done(tabUrl(ctx, "photos"), "Foto toegevoegd.");
}

/** "Gemaakt" is ticked by Sabine on the day; the couple sees it. */
export async function updateGroupPhoto(coupleId: string, photoId: string, change: { who?: string; location?: string; done?: boolean }): Promise<Ok> {
  const ctx = await requireCouple(coupleId);
  if (!ctx.planning || !isUuid(photoId)) return { ok: false, error: "Niet gevonden." };
  if (change.done !== undefined && !ctx.isAdmin) return { ok: false, error: "Sabine vinkt op de dag aan welke foto's gemaakt zijn." };
  const row = await one("select 1 from group_photos where id = $1 and couple_id = $2", [photoId, ctx.couple.id]);
  if (!row) return { ok: false, error: "Niet gevonden." };
  if (change.done !== undefined) await query("update group_photos set done = $2 where id = $1", [photoId, Boolean(change.done)]);
  if (change.who !== undefined && String(change.who).trim()) await query("update group_photos set who = $2 where id = $1", [photoId, String(change.who).trim().slice(0, 500)]);
  if (change.location !== undefined) await query("update group_photos set location = $2 where id = $1", [photoId, String(change.location).trim().slice(0, 200)]);
  return { ok: true };
}

export async function moveGroupPhoto(coupleId: string, photoId: string, toIndex: number): Promise<Ok> {
  const ctx = await requireCouple(coupleId);
  if (!ctx.planning || !isUuid(photoId)) return { ok: false };
  return { ok: await moveRow("group_photos", photoId, ctx.couple.id, Math.max(0, Math.round(toIndex))) };
}

export async function deleteGroupPhoto(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  const id = str(formData, "photoId", 40);
  if (isUuid(id)) await query("delete from group_photos where id = $1 and couple_id = $2", [id, ctx.couple.id]);
  done(tabUrl(ctx, "photos"), "Foto verwijderd.");
}

// Central standard lists (Sabine) ------------------------------------------------------------------

const DEFAULTS = "/beheer/bruidsparen/standaardlijsten";

export async function saveDefaultPackingItem(formData: FormData) {
  await requireOwner();
  const id = str(formData, "itemId", 40);
  if (formData.get("intent") === "delete" && isUuid(id)) {
    await query("delete from default_packing_items where id = $1", [id]);
    done(`${DEFAULTS}#meeneemlijst`, "Verwijderd. Bestaande bruidsparen houden hun lijst.");
  }
  const what = str(formData, "what", 200);
  const list = LISTS.find((l) => l === str(formData, "listKind"));
  if (!what || !list) done(`${DEFAULTS}#meeneemlijst`, "Vul het item in.", true);
  if (isUuid(id)) await query("update default_packing_items set what = $2 where id = $1", [id, what]);
  else await query("insert into default_packing_items (list_kind, what, position) values ($1, $2, (select coalesce(max(position), 0) + 1 from default_packing_items where list_kind = $1))", [list, what]);
  done(`${DEFAULTS}#meeneemlijst`, "Opgeslagen. Geldt voor nieuwe bruidsparen.");
}

export async function saveGroupPhotoIntro(formData: FormData) {
  await requireOwner();
  await query("update settings set group_photo_intro = $1", [str(formData, "intro", 10_000)]);
  done(`${DEFAULTS}#groepsfotos`, "Tekst opgeslagen. Alle bruidsparen zien hem meteen.");
}
