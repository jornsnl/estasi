import "server-only";
import ExcelJS from "exceljs";
import { query, tx } from "./db";
import { planChildSync, type SyncChild, type SyncGuest, type SyncResponse } from "./guest-counts";
import { matchInvitation } from "./pure";

export interface Invitation {
  id: string;
  couple_id: string;
  names: string;
  party_size: number;
  group_id: string | null;
  address: string;
  email: string;
  send_via: "post" | "mail";
  sent: boolean;
  response_id: string | null;
  position: number;
  /** Names of the adults of the household (feedback Sabine, nr. 11); children are in invitation_children. */
  people: string[];
}

export type InvitationRow = Invitation & { responded: "yes" | "maybe" | "no"; match_id: string | null; candidate?: string; children: string[] };

/** The invitation list with "Gereageerd" worked out from the RSVP responses, and the children per household. */
export async function invitationsFor(coupleId: string): Promise<InvitationRow[]> {
  const [list, responses, children] = await Promise.all([
    query<Invitation>("select * from invitations where couple_id = $1 order by position, created_at", [coupleId]),
    query<{ id: string; email: string; people: string[] }>(
      // Guests made from the children of the list itself are left out, so they never decide a match.
      `select r.id, r.email,
              array_remove(array[r.first_name || ' ' || r.last_name] || array_agg(g.first_name || ' ' || g.last_name), null) as people
         from rsvp_responses r left join guests g on g.response_id = r.id and g.invitation_child_id is null
        where r.couple_id = $1 group by r.id`,
      [coupleId],
    ),
    query<SyncChild>("select id, invitation_id, name, linked_guest_id, position from invitation_children where couple_id = $1 order by position, created_at", [coupleId]),
  ]);
  return list.map((inv) => {
    const m = matchInvitation(inv, responses);
    return { ...inv, responded: m.state, match_id: m.responseId, candidate: m.candidate, children: children.filter((c) => c.invitation_id === inv.id).map((c) => c.name) };
  });
}

/**
 * Children of households that signed up become guests of their own (or are
 * linked to the guest the RSVP already has), so they count once everywhere
 * and can be seated. Run after anything that changes a household, its
 * children or the responses.
 */
export async function syncInvitationChildren(coupleId: string): Promise<void> {
  const rows = await invitationsFor(coupleId);
  if (!rows.some((r) => r.children.length)) {
    // Nothing on the list (any more): only clean up what may be left.
    await query("delete from guests where couple_id = $1 and invitation_child_id is not null", [coupleId]);
    return;
  }
  const [children, responses, guests] = await Promise.all([
    query<SyncChild>("select id, invitation_id, name, linked_guest_id, position from invitation_children where couple_id = $1", [coupleId]),
    query<SyncResponse>(
      `select r.id, r.attending, r.partial_note, r.form_id, f.group_id, r.relation
         from rsvp_responses r left join rsvp_forms f on f.id = r.form_id where r.couple_id = $1`,
      [coupleId],
    ),
    query<SyncGuest>("select id, response_id, first_name, last_name, is_kid, invitation_child_id, group_id from guests where couple_id = $1 order by created_at", [coupleId]),
  ]);
  const plan = planChildSync({
    invitations: rows.map((r) => ({ id: r.id, names: r.names, group_id: r.group_id, response_id: r.responded === "yes" ? r.match_id : null })),
    children,
    responses,
    guests,
  });
  if (!plan.links.length && !plan.removals.length && !plan.upserts.length) return;
  await tx(async (db) => {
    for (const l of plan.links) await query("update invitation_children set linked_guest_id = $2 where id = $1", [l.childId, l.guestId], db);
    if (plan.removals.length) await query("delete from guests where couple_id = $1 and id = any($2::uuid[])", [coupleId, plan.removals], db);
    for (const u of plan.upserts) {
      const values = [u.responseId, u.formId, u.groupId, u.firstName, u.lastName, u.attendance, u.partialNote, u.relation, u.notes];
      if (u.guestId) {
        // Relation, notes and diet may have been refined in the guest list: those stay.
        await query(
          `update guests set response_id = $3, form_id = $4, group_id = $5, first_name = $6, last_name = $7, attendance = $8, partial_note = $9,
                  is_kid = true where id = $1 and couple_id = $2`,
          [u.guestId, coupleId, ...values.slice(0, 7)],
          db,
        );
      } else {
        await query(
          `insert into guests (couple_id, invitation_child_id, response_id, form_id, group_id, first_name, last_name, attendance, partial_note, relation, notes, is_kid, created_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, clock_timestamp())
           on conflict do nothing`,
          [coupleId, u.childId, ...values],
          db,
        );
      }
    }
  });
}

const HEADERS = ["Namen", "Aantal personen", "Namen personen", "Waarvan kinderen", "Namen kinderen", "Gastengroep", "Adres", "E-mail", "Kaart versturen via", "Kaart verstuurd", "Gereageerd"];

/** The list as an Excel file (addresses for the envelopes, among other things). */
export async function invitationsWorkbook(rows: InvitationRow[], groups: Map<string, string>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Uitnodigingslijst");
  ws.addRow(HEADERS).font = { bold: true };
  for (const r of rows) {
    ws.addRow([
      r.names, r.party_size, (r.people ?? []).filter(Boolean).join(", "), r.children.length, r.children.filter(Boolean).join(", "), r.group_id ? groups.get(r.group_id) ?? "" : "", r.address, r.email, r.send_via === "mail" ? "Mail" : "Post",
      r.sent ? "Ja" : "Nee", r.responded === "yes" ? "Ja" : r.responded === "maybe" ? "Misschien" : "Nee",
    ]);
  }
  ws.columns.forEach((c, i) => (c.width = [32, 10, 32, 10, 28, 16, 40, 30, 12, 12, 12][i]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface ImportedRow {
  names: string;
  party_size: number;
  group: string;
  address: string;
  email: string;
  send_via: "post" | "mail";
}

const pick = (header: string[], ...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));

/**
 * Reads an Excel (.xlsx) or CSV file. The first row holds the column names;
 * recognised are Namen/Naam, Aantal, Groep, Adres (or Straat + Postcode +
 * Plaats), E-mail and Versturen/Via. Rows without a name are skipped.
 */
export async function readInvitationFile(data: Buffer, fileName: string): Promise<ImportedRow[]> {
  let table: string[][];
  if (/\.csv$/i.test(fileName)) {
    const text = data.toString("utf8").replace(/^﻿/, "");
    const sep = (text.split("\n")[0].match(/;/g) ?? []).length >= (text.split("\n")[0].match(/,/g) ?? []).length ? ";" : ",";
    table = text.split(/\r?\n/).filter((l) => l.trim()).map((line) => splitCsv(line, sep));
  } else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    table = [];
    ws.eachRow((row) => {
      const values = (row.values as unknown[]).slice(1).map((v) => cellText(v));
      table.push(values);
    });
  }
  if (table.length < 2) return [];
  const header = table[0].map((h) => h.toLowerCase().trim());
  const col = {
    names: pick(header, "naam", "namen", "gast"),
    size: pick(header, "aantal", "personen"),
    group: pick(header, "groep"),
    address: pick(header, "adres"),
    street: pick(header, "straat"),
    zip: pick(header, "postcode"),
    city: pick(header, "plaats", "woonplaats"),
    email: pick(header, "mail"),
    via: pick(header, "versturen", "via"),
  };
  if (col.names === -1) col.names = 0;
  const get = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
  return table
    .slice(1)
    .map((row) => {
      const address = get(row, col.address) || [get(row, col.street), [get(row, col.zip), get(row, col.city)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      const size = Math.round(Number(get(row, col.size)));
      return {
        names: get(row, col.names).slice(0, 300),
        party_size: Number.isFinite(size) && size >= 1 && size <= 50 ? size : 1,
        group: get(row, col.group),
        address: address.slice(0, 300),
        email: get(row, col.email).toLowerCase().slice(0, 200),
        send_via: /mail/i.test(get(row, col.via)) ? ("mail" as const) : ("post" as const),
      };
    })
    .filter((r) => r.names)
    .slice(0, 1000);
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.text !== undefined) return String(o.text);
    if (o.result !== undefined) return String(o.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v);
}

function splitCsv(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}
