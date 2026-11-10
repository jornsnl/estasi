import "server-only";
import { z } from "zod/v4";
import { createCouple } from "@/lib/ws/couples";
import { isUuid, one, query, tx } from "@/lib/db";
import { splitName } from "@/lib/ws/pure";
import { CLOSED_DAYS, INTERESTS, SOURCES, STAGES, positionAt, type Interest, type Source, type Stage } from "./rules";

/**
 * Salespipeline: loading and saving leads. The beheer pages (src/app/actions/pipeline.ts)
 * and the MCP tools (src/lib/mcp/tools/pipeline.ts) both go through here, so the checks
 * are the same everywhere. Stage times and the timeline of stage changes are kept by
 * database triggers (migration 0034).
 */

export interface Lead {
  id: string;
  title: string;
  contact_name: string;
  partner_name: string;
  email: string;
  phone: string;
  /** Instagram of the contact, as Sabine writes it (@naam or a link). Migration 0037. */
  instagram: string;
  interest: Interest;
  source: Source;
  /** Where the contact comes from, in her own words. Migration 0037. */
  source_note: string;
  wedding_date: string | null;
  location: string;
  guests: number | null;
  stage: Stage;
  position: number;
  value_cents: number | null;
  probability: number | null;
  notes: string;
  next_action: string;
  next_action_date: string | null;
  lost_reason: string;
  couple_id: string | null;
  stage_changed_at: Date;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Activity {
  id: string;
  lead_id: string;
  kind: "created" | "stage" | "note" | "couple";
  from_stage: Stage | null;
  to_stage: Stage | null;
  body: string;
  actor_name: string | null;
  created_at: Date;
}

const text = (max: number) => z.string().trim().max(max);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als JJJJ-MM-DD").refine((v) => !Number.isNaN(Date.parse(v)), "Geen geldige datum");

/** Every field Sabine (or Claude) can set on a lead. */
export const leadFields = z.object({
  title: text(200).min(1, "Geef de lead een naam."),
  contact_name: text(120),
  partner_name: text(120),
  email: text(200).toLowerCase().refine((v) => !v || /^\S+@\S+\.\S+$/.test(v), "Controleer het e-mailadres."),
  phone: text(40),
  instagram: text(200),
  interest: z.enum(INTERESTS),
  source: z.enum(SOURCES),
  source_note: text(300),
  wedding_date: date.nullable(),
  location: text(200),
  guests: z.number().int().min(0).max(5000).nullable(),
  value_cents: z.number().int().min(0).max(100_000_000).nullable(),
  probability: z.number().int().min(0).max(100).nullable(),
  notes: text(5000),
  next_action: text(300),
  next_action_date: date.nullable(),
  lost_reason: text(300),
});

export type LeadFields = z.infer<typeof leadFields>;
export const newLeadInput = leadFields.partial().extend({ title: leadFields.shape.title, stage: z.enum(STAGES).optional() });
export type NewLeadInput = z.input<typeof newLeadInput>;
export type LeadPatch = Partial<LeadFields>;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const firstIssue = (error: z.ZodError) => error.issues[0]?.message ?? "Ongeldige invoer.";

/** Open leads plus the leads closed in the last CLOSED_DAYS days, in board order. */
export async function listLeads(options: { allClosed?: boolean } = {}): Promise<Lead[]> {
  return query<Lead>(
    `select * from public.pipeline_leads
      where $1::boolean or closed_at is null or closed_at >= now() - make_interval(days => $2)
      order by position`,
    [options.allClosed ?? false, CLOSED_DAYS],
  );
}

export async function getLead(id: string): Promise<Lead | null> {
  if (!isUuid(id)) return null;
  return one<Lead>("select * from public.pipeline_leads where id = $1", [id]);
}

export async function leadActivity(id: string): Promise<Activity[]> {
  return query<Activity>(
    `select a.id, a.lead_id, a.kind, a.from_stage, a.to_stage, a.body, a.created_at, u.name as actor_name
       from public.pipeline_activity a left join public.users u on u.id = a.actor_id
      where a.lead_id = $1 order by a.created_at desc, a.id limit 200`,
    [id],
  );
}

/** Open leads whose next step is due today or earlier (the count next to Pipeline in the menu). */
export async function followUpCount(today: string): Promise<number> {
  const row = await one<{ n: number }>(
    "select count(*)::int as n from public.pipeline_leads where closed_at is null and next_action_date <= $1",
    [today],
  );
  return row?.n ?? 0;
}

async function topPosition(stage: Stage): Promise<number> {
  const row = await one<{ p: number | null }>("select min(position) as p from public.pipeline_leads where stage = $1", [stage]);
  return row?.p === null || row?.p === undefined ? 1000 : row.p - 1000;
}

export async function createLead(input: NewLeadInput): Promise<Result<Lead>> {
  const parsed = newLeadInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  const stage = v.stage ?? "nieuw";
  const lead = await one<Lead>(
    `insert into public.pipeline_leads (title, contact_name, partner_name, email, phone, interest, source, wedding_date, location, guests,
                                        stage, position, value_cents, probability, notes, next_action, next_action_date, lost_reason,
                                        instagram, source_note)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) returning *`,
    [
      v.title, v.contact_name ?? "", v.partner_name ?? "", v.email ?? "", v.phone ?? "", v.interest ?? "weddingplanning", v.source ?? "handmatig",
      v.wedding_date ?? null, v.location ?? "", v.guests ?? null, stage, await topPosition(stage), v.value_cents ?? null, v.probability ?? null,
      v.notes ?? "", v.next_action ?? "", v.next_action_date ?? null, v.lost_reason ?? "",
      v.instagram ?? "", v.source_note ?? "",
    ],
  );
  return { ok: true, value: lead! };
}

/** Changes only the fields that are given. */
export async function updateLead(id: string, patch: LeadPatch): Promise<Result<Lead>> {
  if (!isUuid(id)) return { ok: false, error: "Lead niet gevonden." };
  const parsed = leadFields.partial().safeParse(patch);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const entries = Object.entries(parsed.data).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    const lead = await getLead(id);
    return lead ? { ok: true, value: lead } : { ok: false, error: "Lead niet gevonden." };
  }
  // Column names come from the zod schema above, never from the caller.
  const sets = entries.map(([key], i) => `${key} = $${i + 2}`).join(", ");
  const lead = await one<Lead>(`update public.pipeline_leads set ${sets} where id = $1 returning *`, [id, ...entries.map(([, v]) => v)]);
  return lead ? { ok: true, value: lead } : { ok: false, error: "Lead niet gevonden." };
}

/**
 * To a stage. With `index` (from the board) at that place in the column,
 * otherwise at the top. Moving to Afgevallen can carry the reason.
 */
export async function moveLead(id: string, stage: Stage, options: { index?: number; lostReason?: string } = {}): Promise<Result<Lead>> {
  if (!isUuid(id) || !(STAGES as readonly string[]).includes(stage)) return { ok: false, error: "Ongeldige verplaatsing." };
  return tx(async (db) => {
    const others = await query<{ position: number }>(
      "select position from public.pipeline_leads where stage = $1 and id <> $2 for update",
      [stage, id],
      db,
    );
    const index = Number.isInteger(options.index) ? (options.index as number) : 0;
    const position = positionAt(others.map((o) => o.position), index);
    const lead = await one<Lead>(
      `update public.pipeline_leads set stage = $2, position = $3,
              lost_reason = case when $2 = 'afgevallen' and $4::text is not null then $4 else lost_reason end
        where id = $1 returning *`,
      [id, stage, position, options.lostReason?.trim().slice(0, 300) || null],
      db,
    );
    return lead ? { ok: true as const, value: lead } : { ok: false as const, error: "Lead niet gevonden." };
  });
}

export async function addNote(id: string, body: string, actorId: string | null): Promise<Result<null>> {
  const clean = body.trim().slice(0, 5000);
  if (!clean) return { ok: false, error: "Schrijf eerst een notitie." };
  if (!(await getLead(id))) return { ok: false, error: "Lead niet gevonden." };
  await query("insert into public.pipeline_activity (lead_id, kind, body, actor_id) values ($1, 'note', $2, $3)", [id, clean, actorId]);
  return { ok: true, value: null };
}

export async function deleteLead(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  return Boolean(await one("delete from public.pipeline_leads where id = $1 returning id", [id]));
}

/**
 * "Maak bruidspaar": links an existing couple with the same e-mail address or
 * makes a new portal in concept with the details of the lead (no packages yet,
 * Sabine picks those on the couple). The lead moves to Geboekt.
 */
export async function convertToCouple(id: string, actorId: string): Promise<Result<{ coupleId: string; created: boolean }>> {
  const lead = await getLead(id);
  if (!lead) return { ok: false, error: "Lead niet gevonden." };
  let coupleId = lead.couple_id;
  let created = false;
  if (!coupleId && lead.email) {
    const existing = await one<{ id: string }>(
      "select id from wedding_space.couples where lower(partner1_email) = $1 or lower(partner2_email) = $1 order by created_at desc limit 1",
      [lead.email.toLowerCase()],
    );
    coupleId = existing?.id ?? null;
  }
  if (!coupleId) {
    const p1 = splitName(lead.contact_name || lead.title);
    const p2 = splitName(lead.partner_name);
    coupleId = await createCouple(
      {
        partner1_first: p1.first || lead.title,
        partner1_last: p1.last,
        partner1_email: lead.email,
        partner1_phone: lead.phone,
        partner2_first: p2.first,
        partner2_last: p2.last,
        partner2_email: "",
        partner2_phone: "",
        address: "",
        wedding_date: lead.wedding_date,
        wedding_date_confirmed: Boolean(lead.wedding_date),
        location: lead.location,
        package_ids: [],
        meetings: 0,
      },
      actorId,
    );
    created = true;
  }
  await query("update public.pipeline_leads set couple_id = $2 where id = $1", [id, coupleId]);
  if (lead.stage !== "geboekt") await moveLead(id, "geboekt");
  return { ok: true, value: { coupleId, created } };
}
