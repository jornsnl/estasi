"use server";

import { requireCouple, requireCoupleAdmin, type CoupleContext } from "@/lib/ws/access";
import { logActivity } from "@/lib/ws/couples";
import { isUuid, one, query } from "@/lib/ws/db";
import { moveRow } from "@/lib/ws/order";
import { indexForTime } from "@/lib/ws/pure";
import { done, str } from "@/lib/ws/redirect";
import { PALETTE, peopleFor, rowsFor, type Person, type RunsheetRow } from "@/lib/ws/runsheet";

/**
 * Day planning and list tabs, saved row by row from the page. Sabine may
 * change every row; the couple only the rows they added themselves.
 */

type Result = { ok: true; rows: RunsheetRow[]; people: Person[] } | { ok: false; error: string };

const MAX = { at_time: 20, what: 1000, info: 4000, location: 300, rain_location: 300 } as const;
export interface RowInput {
  at_time?: string;
  what?: string;
  info?: string;
  location?: string;
  rain_location?: string;
  people?: string[];
}

async function tabOf(ctx: CoupleContext, tabId: string) {
  if (!isUuid(tabId)) return null;
  return one<{ id: string; kind: string }>("select id, kind from runsheet_tabs where id = $1 and couple_id = $2", [tabId, ctx.couple.id]);
}

async function state(ctx: CoupleContext, tabId: string): Promise<Result> {
  const [rows, people] = await Promise.all([rowsFor(ctx.couple.id, tabId), peopleFor(ctx.couple.id)]);
  return { ok: true, rows, people };
}

/** Names that are new get a colour of their own (the couple may change it later). */
async function ensurePeople(ctx: CoupleContext, names: string[], colors: Record<string, string> = {}) {
  const existing = await peopleFor(ctx.couple.id);
  for (const name of names) {
    if (existing.some((p) => p.name.toLowerCase() === name.toLowerCase())) continue;
    const color = PALETTE.includes(colors[name]) ? colors[name] : PALETTE[(existing.length + 2) % PALETTE.length];
    await query(
      "insert into couple_people (couple_id, name, color, position) values ($1, $2, $3, $4) on conflict do nothing",
      [ctx.couple.id, name, color, existing.length + 1],
    );
    existing.push({ id: "", name, color });
  }
}

const cleanPeople = (list: unknown) =>
  [...new Set((Array.isArray(list) ? list : []).map((n) => String(n).trim().slice(0, 60)).filter(Boolean))].slice(0, 12);

/** Adds a row (rowId null) or saves one. A new time moves the row to its place in the time line. */
export async function saveRow(coupleId: string, tabId: string, rowId: string | null, input: RowInput, colors?: Record<string, string>): Promise<Result> {
  const ctx = await requireCouple(coupleId);
  const tab = ctx.planning ? await tabOf(ctx, tabId) : null;
  if (!tab || (tab.kind !== "schedule" && tab.kind !== "list")) return { ok: false, error: "Tabblad niet gevonden." };
  const people = cleanPeople(input.people);
  await ensurePeople(ctx, people, colors);
  const values = {
    at_time: String(input.at_time ?? "").trim().slice(0, MAX.at_time),
    what: String(input.what ?? "").slice(0, MAX.what),
    info: String(input.info ?? "").slice(0, MAX.info),
    location: String(input.location ?? "").trim().slice(0, MAX.location),
    rain_location: String(input.rain_location ?? "").trim().slice(0, MAX.rain_location),
  };

  if (!rowId) {
    await query(
      `insert into runsheet_rows (couple_id, tab_id, at_time, what, info, location, rain_location, people, who, position, created_by, created_by_name, by_admin)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, (select coalesce(max(position), 0) + 1 from runsheet_rows where tab_id = $2), $10, $11, $12)`,
      [ctx.couple.id, tab.id, values.at_time, values.what, values.info, values.location, values.rain_location, people, people.join(", "),
       ctx.account.id, ctx.isAdmin ? "Sabine" : ctx.account.name.split(" ")[0], ctx.isAdmin],
    );
    if (!ctx.isAdmin) await logActivity(ctx.couple.id, ctx.account.id, "Regel toegevoegd in het draaiboek");
    return state(ctx, tab.id);
  }

  if (!isUuid(rowId)) return { ok: false, error: "Regel niet gevonden." };
  const row = await one<{ by_admin: boolean; at_time: string }>("select by_admin, at_time from runsheet_rows where id = $1 and tab_id = $2", [rowId, tab.id]);
  if (!row) return { ok: false, error: "Regel niet gevonden." };
  if (row.by_admin && !ctx.isAdmin) return { ok: false, error: "Deze regel is van Sabine; die kunnen jullie bekijken maar niet wijzigen." };
  await query(
    `update runsheet_rows set at_time = $2, what = $3, info = $4, location = $5, rain_location = $6, people = $7, who = $8 where id = $1`,
    [rowId, values.at_time, values.what, values.info, values.location, values.rain_location, people, people.join(", ")],
  );
  if (tab.kind === "schedule" && values.at_time !== row.at_time) {
    const rows = await rowsFor(ctx.couple.id, tab.id);
    await moveRow("runsheet_rows", rowId, tab.id, indexForTime(rows, rowId, values.at_time));
  }
  return state(ctx, tab.id);
}

export async function deleteRow(coupleId: string, tabId: string, rowId: string): Promise<Result> {
  const ctx = await requireCouple(coupleId);
  const tab = ctx.planning ? await tabOf(ctx, tabId) : null;
  if (!tab || !isUuid(rowId)) return { ok: false, error: "Niet gevonden." };
  const row = await one<{ by_admin: boolean }>("select by_admin from runsheet_rows where id = $1 and tab_id = $2", [rowId, tab.id]);
  if (!row) return { ok: false, error: "Regel niet gevonden." };
  if (row.by_admin && !ctx.isAdmin) return { ok: false, error: "Deze regel is van Sabine." };
  await query("delete from runsheet_rows where id = $1", [rowId]);
  return state(ctx, tab.id);
}

/** Dragging or the arrows: the time stays as it is (a time that does not fit turns light red). */
export async function moveRunsheetRow(coupleId: string, tabId: string, rowId: string, toIndex: number): Promise<Result> {
  const ctx = await requireCouple(coupleId);
  const tab = ctx.planning ? await tabOf(ctx, tabId) : null;
  if (!tab || !isUuid(rowId)) return { ok: false, error: "Niet gevonden." };
  const row = await one<{ by_admin: boolean }>("select by_admin from runsheet_rows where id = $1 and tab_id = $2", [rowId, tab.id]);
  if (!row) return { ok: false, error: "Regel niet gevonden." };
  if (row.by_admin && !ctx.isAdmin) return { ok: false, error: "Rijen van Sabine kunnen jullie niet verplaatsen." };
  await moveRow("runsheet_rows", rowId, tab.id, Math.max(0, Math.round(Number(toIndex) || 0)));
  return state(ctx, tab.id);
}

/** A colour for a name: every row with that name changes along. */
export async function setPersonColor(coupleId: string, personId: string, color: string): Promise<{ ok: boolean; people?: Person[] }> {
  const ctx = await requireCouple(coupleId);
  if (!isUuid(personId) || !PALETTE.includes(color)) return { ok: false };
  await query("update couple_people set color = $3 where id = $1 and couple_id = $2", [personId, ctx.couple.id, color]);
  return { ok: true, people: await peopleFor(ctx.couple.id) };
}

/** Sabine tidies up the list of names (rows keep the name, it just loses its colour). */
export async function deletePerson(coupleId: string, personId: string): Promise<{ ok: boolean; people?: Person[] }> {
  const ctx = await requireCoupleAdmin(coupleId);
  if (!isUuid(personId)) return { ok: false };
  await query("delete from couple_people where id = $1 and couple_id = $2", [personId, ctx.couple.id]);
  return { ok: true, people: await peopleFor(ctx.couple.id) };
}

// Tabs (Sabine only) ------------------------------------------------------------------------------

export async function saveTab(formData: FormData) {
  const ctx = await requireCoupleAdmin(str(formData, "coupleId", 40));
  const tabId = str(formData, "tabId", 40);
  const back = `/k/${ctx.couple.id}/draaiboek`;
  const title = str(formData, "title", 80);
  if (formData.get("intent") === "delete" && isUuid(tabId)) {
    await query("delete from runsheet_tabs where id = $1 and couple_id = $2", [tabId, ctx.couple.id]);
    done(back, "Tabblad verwijderd.");
  }
  if (!title) done(back, "Geef het tabblad een naam.", true);
  if (isUuid(tabId)) {
    await query("update runsheet_tabs set title = $3 where id = $1 and couple_id = $2", [tabId, ctx.couple.id, title]);
    done(`${back}?tab=${tabId}`, "Tabblad hernoemd.");
  }
  const kind = str(formData, "kind") === "schedule" ? "schedule" : "list";
  const tab = await one<{ id: string }>(
    "insert into runsheet_tabs (couple_id, title, kind, position) values ($1, $2, $3, (select coalesce(max(position), 0) + 1 from runsheet_tabs where couple_id = $1)) returning id",
    [ctx.couple.id, title, kind],
  );
  done(`${back}?tab=${tab!.id}`, "Tabblad toegevoegd.");
}

export async function moveTab(formData: FormData) {
  const ctx = await requireCoupleAdmin(str(formData, "coupleId", 40));
  const tabId = str(formData, "id", 40);
  if (isUuid(tabId)) await moveRow("runsheet_tabs", tabId, ctx.couple.id, str(formData, "direction") === "up" ? "up" : "down");
  done(`/k/${ctx.couple.id}/draaiboek`, "Volgorde aangepast.");
}
