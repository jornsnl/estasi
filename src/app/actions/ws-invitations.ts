"use server";

import { requireCouple, type CoupleContext } from "@/lib/ws/access";
import { logActivity } from "@/lib/ws/couples";
import { isUuid, one, query, tx } from "@/lib/ws/db";
import { cleanChildren } from "@/lib/ws/guest-counts";
import { readInvitationFile, syncInvitationChildren } from "@/lib/ws/invitations";
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
  // Feedback Sabine (11): a name per person; the ones ticked "Kind" are the children.
  const persons = Array.from({ length: size }, (_, i) => ({ name: str(formData, `person_${i}`, 120), kid: formData.get(`person_kid_${i}`) === "on" }));
  const kidCount = persons.filter((p) => p.kid).length;
  const kids = cleanChildren(persons.filter((p) => p.kid).map((p) => p.name), size);
  const people = cleanPeople(persons.filter((p) => !p.kid).map((p) => p.name), size - kidCount);
  await tx(async (db) => {
    const row = await one<{ id: string }>(
      `insert into invitations (couple_id, names, party_size, group_id, address, email, send_via, people, position)
       values ($1, $2, $3, $4, $5, $6, $7, $8, (select coalesce(max(position), 0) + 1 from invitations where couple_id = $1)) returning id`,
      [ctx.couple.id, names, size, await groupOf(ctx, str(formData, "groupId", 40)), str(formData, "address", 300),
       str(formData, "email", 200).toLowerCase(), str(formData, "sendVia") === "mail" ? "mail" : "post", people],
      db,
    );
    for (const [i, name] of kids.entries()) {
      await query("insert into invitation_children (couple_id, invitation_id, name, position) values ($1, $2, $3, $4)", [ctx.couple.id, row!.id, name, i + 1], db);
    }
  });
  await syncInvitationChildren(ctx.couple.id);
  await note(ctx, "Uitnodigingslijst bijgewerkt");
  done(page(ctx.couple.id), `${names} toegevoegd.`);
}

/** Names of the adults: trimmed, at most as many as there are adults, empty ones at the end dropped. */
function cleanPeople(names: string[], max: number): string[] {
  const list = names.slice(0, Math.max(0, max)).map((n) => String(n).trim().slice(0, 120));
  while (list.length && !list[list.length - 1]) list.pop();
  return list;
}

/** Feedback Sabine (11): the names of the adults of a household, from the table. */
export async function setInvitationPeople(coupleId: string, invitationId: string, names: string[]): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireCouple(coupleId);
  if (!ctx.planning || !isUuid(invitationId) || !Array.isArray(names)) return { ok: false, error: "Niet gevonden." };
  const inv = await one<{ party_size: number; kids: number }>(
    "select party_size, (select count(*)::int from invitation_children c where c.invitation_id = i.id) as kids from invitations i where id = $1 and couple_id = $2",
    [invitationId, ctx.couple.id],
  );
  if (!inv) return { ok: false, error: "Niet gevonden." };
  await query("update invitations set people = $3 where id = $1 and couple_id = $2", [invitationId, ctx.couple.id, cleanPeople(names.map(String), inv.party_size - inv.kids)]);
  await note(ctx, "Uitnodigingslijst bijgewerkt");
  return { ok: true };
}

type Field = "names" | "party_size" | "group_id" | "address" | "email" | "send_via" | "sent";

/** One field of one row, straight from the table. */
export async function updateInvitation(coupleId: string, invitationId: string, field: Field, value: string | boolean): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireCouple(coupleId);
  if (!ctx.planning || !isUuid(invitationId)) return { ok: false, error: "Niet gevonden." };
  let clean: string | number | boolean | null;
  switch (field) {
    case "names": clean = String(value).trim().slice(0, 300); if (!clean) return { ok: false, error: "Namen mogen niet leeg zijn." }; break;
    case "party_size": {
      clean = Math.max(1, Math.min(50, Math.round(Number(value)) || 1));
      const kids = await one<{ n: number }>("select count(*)::int as n from invitation_children where invitation_id = $1 and couple_id = $2", [invitationId, ctx.couple.id]);
      if ((kids?.n ?? 0) > clean) return { ok: false, error: "Minder personen dan kinderen kan niet: kinderen tellen mee in het aantal personen." };
      break;
    }
    case "group_id": clean = await groupOf(ctx, String(value)); break;
    case "address": clean = String(value).trim().slice(0, 300); break;
    case "email": clean = String(value).trim().toLowerCase().slice(0, 200); break;
    case "send_via": clean = value === "mail" ? "mail" : "post"; break;
    case "sent": clean = Boolean(value); break;
    default: return { ok: false, error: "Onbekend veld." };
  }
  // The column comes from the switch above, never from the browser.
  const updated = await one(`update invitations set ${field} = $3 where id = $1 and couple_id = $2 returning id`, [invitationId, ctx.couple.id, clean]);
  if (updated && ["names", "email", "group_id"].includes(field)) await syncInvitationChildren(ctx.couple.id);
  return updated ? { ok: true } : { ok: false, error: "Niet gevonden." };
}

/**
 * "Aantal kinderen" with a name per child: each child is a record of its own,
 * kept by its place in the row (so a guest made from it, and its seat, stay).
 */
export async function setInvitationChildren(coupleId: string, invitationId: string, names: string[]): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireCouple(coupleId);
  if (!ctx.planning || !isUuid(invitationId) || !Array.isArray(names)) return { ok: false, error: "Niet gevonden." };
  const inv = await one<{ party_size: number }>("select party_size from invitations where id = $1 and couple_id = $2", [invitationId, ctx.couple.id]);
  if (!inv) return { ok: false, error: "Niet gevonden." };
  if (names.length > inv.party_size) return { ok: false, error: "Meer kinderen dan personen kan niet: verhoog eerst het aantal personen." };
  const kids = cleanChildren(names.map(String), inv.party_size);
  await tx(async (db) => {
    const existing = await query<{ id: string }>("select id from invitation_children where invitation_id = $1 order by position, created_at", [invitationId], db);
    for (const [i, name] of kids.entries()) {
      if (existing[i]) await query("update invitation_children set name = $2, position = $3 where id = $1", [existing[i].id, name, i + 1], db);
      else await query("insert into invitation_children (couple_id, invitation_id, name, position) values ($1, $2, $3, $4)", [ctx.couple.id, invitationId, name, i + 1], db);
    }
    const gone = existing.slice(kids.length).map((e) => e.id);
    if (gone.length) await query("delete from invitation_children where id = any($1::uuid[])", [gone], db);
  });
  await syncInvitationChildren(ctx.couple.id);
  await note(ctx, "Uitnodigingslijst bijgewerkt");
  return { ok: true };
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
    await syncInvitationChildren(ctx.couple.id);
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
