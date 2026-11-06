"use server";

import { requireCouple, type CoupleContext } from "@/lib/ws/access";
import { logActivity } from "@/lib/ws/couples";
import { isUuid, one, query, tx } from "@/lib/ws/db";
import { readInvitationFile } from "@/lib/ws/invitations";
import { done, str } from "@/lib/ws/redirect";

/** "Uitnodigingslijst": Sabine and the couple may both do everything here. */

const page = (coupleId: string) => `/k/${coupleId}/gasten/uitnodigingen`;
const ctxFrom = (formData: FormData) => requireCouple(str(formData, "coupleId", 40));
async function note(ctx: CoupleContext, action: string) {
  if (!ctx.isAdmin) await logActivity(ctx.couple.id, ctx.account.id, action);
}

async function groupOf(ctx: CoupleContext, value: string) {
  if (!isUuid(value)) return null;
  return (await one<{ id: string }>("select id from guest_groups where id = $1 and couple_id = $2", [value, ctx.couple.id]))?.id ?? null;
}

export async function addInvitation(formData: FormData) {
  const ctx = await ctxFrom(formData);
  if (!ctx.planning) done(page(ctx.couple.id), "Niet beschikbaar.", true);
  const names = str(formData, "names", 300);
  if (!names) done(page(ctx.couple.id), "Vul de namen van het huishouden in.", true);
  const size = Math.max(1, Math.min(50, Math.round(Number(str(formData, "partySize", 3))) || 1));
  await query(
    `insert into invitations (couple_id, names, party_size, group_id, address, email, send_via, position)
     values ($1, $2, $3, $4, $5, $6, $7, (select coalesce(max(position), 0) + 1 from invitations where couple_id = $1))`,
    [ctx.couple.id, names, size, await groupOf(ctx, str(formData, "groupId", 40)), str(formData, "address", 300),
     str(formData, "email", 200).toLowerCase(), str(formData, "sendVia") === "mail" ? "mail" : "post"],
  );
  await note(ctx, "Uitnodigingslijst bijgewerkt");
  done(page(ctx.couple.id), `${names} toegevoegd.`);
}

type Field = "names" | "party_size" | "group_id" | "address" | "email" | "send_via" | "sent";

/** One field of one row, straight from the table. */
export async function updateInvitation(coupleId: string, invitationId: string, field: Field, value: string | boolean): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireCouple(coupleId);
  if (!ctx.planning || !isUuid(invitationId)) return { ok: false, error: "Niet gevonden." };
  let clean: string | number | boolean | null;
  switch (field) {
    case "names": clean = String(value).trim().slice(0, 300); if (!clean) return { ok: false, error: "Namen mogen niet leeg zijn." }; break;
    case "party_size": clean = Math.max(1, Math.min(50, Math.round(Number(value)) || 1)); break;
    case "group_id": clean = await groupOf(ctx, String(value)); break;
    case "address": clean = String(value).trim().slice(0, 300); break;
    case "email": clean = String(value).trim().toLowerCase().slice(0, 200); break;
    case "send_via": clean = value === "mail" ? "mail" : "post"; break;
    case "sent": clean = Boolean(value); break;
    default: return { ok: false, error: "Onbekend veld." };
  }
  // The column comes from the switch above, never from the browser.
  const updated = await one(`update invitations set ${field} = $3 where id = $1 and couple_id = $2 returning id`, [invitationId, ctx.couple.id, clean]);
  return updated ? { ok: true } : { ok: false, error: "Niet gevonden." };
}

export async function deleteInvitation(formData: FormData) {
  const ctx = await ctxFrom(formData);
  const id = str(formData, "invitationId", 40);
  if (isUuid(id)) await query("delete from invitations where id = $1 and couple_id = $2", [id, ctx.couple.id]);
  done(page(ctx.couple.id), "Verwijderd.");
}

/** "Bij twijfel bevestigen": this response belongs to this household. */
export async function confirmInvitationResponse(formData: FormData) {
  const ctx = await ctxFrom(formData);
  const id = str(formData, "invitationId", 40);
  const responseId = str(formData, "responseId", 40);
  if (isUuid(id) && isUuid(responseId) && (await one("select 1 from rsvp_responses where id = $1 and couple_id = $2", [responseId, ctx.couple.id]))) {
    await query("update invitations set response_id = $3 where id = $1 and couple_id = $2", [id, ctx.couple.id, responseId]);
  }
  done(page(ctx.couple.id), "Bevestigd: dit huishouden heeft gereageerd.");
}

/** "Importeren uit Excel": adds the rows of an .xlsx or .csv file. */
export async function importInvitations(formData: FormData) {
  const ctx = await ctxFrom(formData);
  const back = page(ctx.couple.id);
  const file = formData.get("file");
  if (!file || typeof file === "string" || file.size === 0) done(back, "Kies eerst een Excel-bestand.", true);
  if (!/\.(xlsx|csv)$/i.test(file.name)) done(back, "Kies een .xlsx- of .csv-bestand. Een oud .xls-bestand eerst opslaan als .xlsx.", true);
  if (file.size > 5 * 1024 * 1024) done(back, "Het bestand is groter dan 5 MB.", true);
  let rows;
  try {
    rows = await readInvitationFile(Buffer.from(await file.arrayBuffer()), file.name);
  } catch {
    done(back, "Dit bestand kon niet gelezen worden. Is het een Excel-bestand (.xlsx)?", true);
  }
  if (rows.length === 0) done(back, "Geen regels gevonden. De eerste regel moet de kolomnamen bevatten, met minstens een kolom Namen.", true);
  const groups = await query<{ id: string; name: string }>("select id, name from guest_groups where couple_id = $1", [ctx.couple.id]);
  await tx(async (db) => {
    let position = (await one<{ p: number }>("select coalesce(max(position), 0)::int as p from invitations where couple_id = $1", [ctx.couple.id], db))!.p;
    for (const r of rows) {
      const group = groups.find((g) => r.group && g.name.toLowerCase() === r.group.toLowerCase())
        ?? groups.find((g) => r.group && g.name.toLowerCase().startsWith(r.group.toLowerCase().slice(0, 3)));
      await query(
        `insert into invitations (couple_id, names, party_size, group_id, address, email, send_via, position) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [ctx.couple.id, r.names, r.party_size, group?.id ?? null, r.address, r.email, r.send_via, ++position],
        db,
      );
    }
  });
  await note(ctx, `${rows.length} uitnodigingen geïmporteerd`);
  done(back, `${rows.length} ${rows.length === 1 ? "regel" : "regels"} geïmporteerd.`);
}
