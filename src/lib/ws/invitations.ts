import "server-only";
import ExcelJS from "exceljs";
import { query } from "./db";
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
}

export type InvitationRow = Invitation & { responded: "yes" | "maybe" | "no"; match_id: string | null; candidate?: string };

/** The invitation list with "Gereageerd" worked out from the RSVP responses. */
export async function invitationsFor(coupleId: string): Promise<InvitationRow[]> {
  const [list, responses] = await Promise.all([
    query<Invitation>("select * from invitations where couple_id = $1 order by position, created_at", [coupleId]),
    query<{ id: string; email: string; people: string[] }>(
      `select r.id, r.email,
              array_remove(array[r.first_name || ' ' || r.last_name] || array_agg(g.first_name || ' ' || g.last_name), null) as people
         from rsvp_responses r left join guests g on g.response_id = r.id
        where r.couple_id = $1 group by r.id`,
      [coupleId],
    ),
  ]);
  return list.map((inv) => {
    const m = matchInvitation(inv, responses);
    return { ...inv, responded: m.state, match_id: m.responseId, candidate: m.candidate };
  });
}

const HEADERS = ["Namen", "Aantal personen", "Gastengroep", "Adres", "E-mail", "Kaart versturen via", "Kaart verstuurd", "Gereageerd"];

/** The list as an Excel file (addresses for the envelopes, among other things). */
export async function invitationsWorkbook(rows: InvitationRow[], groups: Map<string, string>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Uitnodigingslijst");
  ws.addRow(HEADERS).font = { bold: true };
  for (const r of rows) {
    ws.addRow([
      r.names, r.party_size, r.group_id ? groups.get(r.group_id) ?? "" : "", r.address, r.email, r.send_via === "mail" ? "Mail" : "Post",
      r.sent ? "Ja" : "Nee", r.responded === "yes" ? "Ja" : r.responded === "maybe" ? "Misschien" : "Nee",
    ]);
  }
  ws.columns.forEach((c, i) => (c.width = [32, 10, 16, 40, 30, 12, 12, 12][i]));
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
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) (out.push(cur), (cur = ""));
    else cur += c;
  }
  out.push(cur);
  return out;
}
