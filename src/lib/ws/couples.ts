import "server-only";
import { randomBytes } from "crypto";
import { defaultTexts } from "./rsvp";
import { one, query, tx } from "./db";
import { getStore } from "@/lib/data";
import { isActivated } from "@/lib/domain/account";
import type { Couple, Package } from "./types";
import { ensureCoupleUser, loginLink } from "./logins";
import { DEFAULT_TABS } from "./runsheet";
import { getSettings } from "./settings";

export interface CoupleListRow extends Couple {
  package_name: string | null;
  open_questions: number;
  open_sabine_tasks: number;
  last_activity: Date | null;
}

export async function listCouples(includeArchived = false): Promise<CoupleListRow[]> {
  return query<CoupleListRow>(
    `select c.*,
            (select string_agg(p.name || case when p.variant <> '' then ' (' || p.variant || ')' else '' end, ' + ' order by p.position)
               from couple_packages cp join packages p on p.id = cp.package_id where cp.couple_id = c.id) as package_name,
            (select count(*)::int from questions q where q.couple_id = c.id and q.answered_at is null) as open_questions,
            (select count(*)::int from tasks t where t.couple_id = c.id and t.lane = 'sabine' and t.done_at is null) as open_sabine_tasks,
            (select max(at) from activity x where x.couple_id = c.id) as last_activity
       from couples c
      where $1 or c.status <> 'archived'
      order by c.wedding_date nulls last, c.created_at`,
    [includeArchived],
  );
}

/** The packages of a couple, in catalogue order. */
export async function couplePackages(coupleId: string, db?: Parameters<typeof query>[2]): Promise<Package[]> {
  return query<Package>(
    "select p.* from couple_packages cp join packages p on p.id = cp.package_id where cp.couple_id = $1 order by p.position, p.name",
    [coupleId],
    db,
  );
}

/** Adds packages to a couple: their starting tasks come along (not twice). */
export async function addPackages(coupleId: string, packageIds: string[], createdBy: string, db?: Parameters<typeof query>[2]) {
  for (const packageId of packageIds) {
    const added = await one<{ package_id: string }>(
      "insert into couple_packages (couple_id, package_id) values ($1, $2) on conflict do nothing returning package_id",
      [coupleId, packageId],
      db,
    );
    if (!added) continue;
    await query(
      `insert into tasks (couple_id, lane, title, position, created_by)
       select $1, pt.lane, pt.title, pt.position, $3 from package_tasks pt
        where pt.package_id = $2
          and not exists (select 1 from tasks t where t.couple_id = $1 and t.lane = pt.lane and lower(t.title) = lower(pt.title))`,
      [coupleId, packageId, createdBy],
      db,
    );
  }
}

export interface NewCouple {
  partner1_first: string;
  partner1_last: string;
  partner1_email: string;
  partner1_phone: string;
  partner2_first: string;
  partner2_last: string;
  partner2_email: string;
  partner2_phone: string;
  address: string;
  wedding_date: string | null;
  wedding_date_confirmed: boolean;
  location: string;
  package_ids: string[];
  meetings: number;
}

/**
 * Creates the portal in "concept": Sabine sees it, the couple not yet.
 * It starts with the package's tasks, the meetings for "Jullie Pakket"
 * and the fixed detail meeting.
 */
export async function createCouple(input: NewCouple, createdBy: string): Promise<string> {
  const settings = await getSettings();
  return tx(async (db) => {
    const packages = input.package_ids.length
      ? await query<Package>("select * from packages where id = any($1::uuid[])", [input.package_ids], db)
      : [];
    const couple = await one<{ id: string }>(
      `insert into couples (partner1_first, partner1_last, partner1_email, partner1_phone,
                            partner2_first, partner2_last, partner2_email, partner2_phone,
                            address, wedding_date, wedding_date_confirmed, location, package_id, suppliers_enabled, welcome_text)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
      [
        input.partner1_first, input.partner1_last, input.partner1_email, input.partner1_phone,
        input.partner2_first, input.partner2_last, input.partner2_email, input.partner2_phone,
        input.address, input.wedding_date, input.wedding_date_confirmed, input.location,
        packages[0]?.id ?? null, packages.length === 0 || packages.some((p) => p.suppliers_enabled), settings.default_welcome,
      ],
      db,
    );
    const coupleId = couple!.id;
    await addPackages(coupleId, packages.map((p) => p.id), createdBy, db);
    // Standard guest groups, each with its own RSVP form and Sabine's standard texts.
    const groups = await query<{ id: string; name: string; kind: string; position: number }>(
      "insert into guest_groups (couple_id, name, kind, position) values ($1, 'Daggasten', 'day', 1), ($1, 'Avondgasten', 'evening', 2) returning id, name, kind, position",
      [coupleId],
      db,
    );
    const texts = defaultTexts(settings);
    for (const g of groups) {
      await query(
        `insert into rsvp_forms (couple_id, group_id, slug, name, intro, ask_part_of_day, ask_diet, confirmation_subject, confirmation_text,
                                 decline_subject, decline_text, position)
         values ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10, $11)`,
        [coupleId, g.id, randomBytes(9).toString("base64url"), g.name, texts.intro, g.kind === "day", texts.confirmationSubject,
         texts.confirmation, texts.declineSubject, texts.decline, g.position],
        db,
      );
    }

    const guides = Array.isArray(settings.meeting_guides) ? settings.meeting_guides : [];
    for (let n = 1; n <= input.meetings; n++) {
      await query(
        "insert into meetings (couple_id, kind, title, guide, status, position) values ($1, 'meeting', $2, $3, 'to_plan', $4)",
        [coupleId, `Meeting ${n}`, guides[n - 1] ?? "", n],
        db,
      );
    }
    if (input.meetings > 0) {
      await query(
        "insert into meetings (couple_id, kind, title, guide, status, position) values ($1, 'detail', 'Detailbespreking', $2, 'to_plan', $3)",
        [coupleId, settings.detail_guide, input.meetings + 1],
        db,
      );
    }
    await query(
      `insert into runsheet_tabs (couple_id, title, kind, position)
       select $1, t.title, t.kind, t.ord from unnest($2::text[], $3::text[]) with ordinality as t (title, kind, ord)`,
      [coupleId, DEFAULT_TABS.map(([title]) => title), DEFAULT_TABS.map(([, kind]) => kind)],
      db,
    );
    // The partners' names, each with an own colour, for "Wie" in the day planning.
    await query(
      `insert into couple_people (couple_id, name, color, position)
       select $1, n.name, n.color, n.position from (values ($2, '#E8C9CF', 1), ($3, '#D9E4CF', 2)) as n (name, color, position)
        where n.name <> '' on conflict do nothing`,
      [coupleId, input.partner1_first, input.partner2_first],
      db,
    );
    // The standard places of the styling plan (Sabine keeps the list in Beheer).
    await query(
      `insert into styling_places (couple_id, name, position)
       select $1, p.name, p.ord from jsonb_array_elements_text($2::jsonb) with ordinality as p (name, ord)`,
      [coupleId, JSON.stringify(settings.default_styling_places ?? [])],
      db,
    );
    // Meal moments from Sabine's standard list.
    await query("insert into meal_moments (couple_id, name, position) select $1, name, position from default_meal_moments", [coupleId], db);
    // Standard packing lists, with both first names as "who takes it".
    await query(
      `insert into packing_items (couple_id, list_kind, what, who, is_default, position)
       select $1, list_kind, what, $2, true, position from default_packing_items`,
      [coupleId, [input.partner1_first, input.partner2_first].filter(Boolean).join(" & ")],
      db,
    );
    const templates = await query<{ id: string }>("select id from assignment_templates where not archived order by position", [], db);
    for (const t of templates) await copyAssignmentTemplate(coupleId, t.id, db);
    return coupleId;
  });
}

/** Copies one of Sabine's assignment templates into a couple's portal. */
export async function copyAssignmentTemplate(coupleId: string, templateId: string, db?: Parameters<typeof query>[2]) {
  const assignment = await one<{ id: string }>(
    `insert into assignments (couple_id, template_id, title, intro, styling_source, kind, closing, budget, position)
     select $1, t.id, t.title, t.intro, t.styling_source, t.kind, t.closing, t.budget,
            (select coalesce(max(position), 0) + 1 from assignments where couple_id = $1)
       from assignment_templates t where t.id = $2 returning id`,
    [coupleId, templateId],
    db,
  );
  if (!assignment) return null;
  await query(
    `insert into assignment_questions (assignment_id, prompt, help, position)
     select $1, prompt, help, position from assignment_template_questions where template_id = $2`,
    [assignment.id, templateId],
    db,
  );
  await query(
    `insert into assignment_sections (assignment_id, title, intro, kind, fields, tips, embeds, example_file_id, notice, position)
     select $1, title, intro, kind, fields, tips, embeds, example_file_id, notice, position from assignment_template_sections where template_id = $2`,
    [assignment.id, templateId],
    db,
  );
  return assignment.id;
}

export interface ShareResult {
  email: string;
  link: string;
  isNew: boolean;
}

/**
 * "Maak beschikbaar en deel": makes the portal visible and gives each partner
 * with an e-mail address an Academy account (role "couple") plus a one-time
 * link to choose a password. Partners who already have a password get none.
 */
export async function activateCouple(couple: Couple): Promise<ShareResult[]> {
  const partners = [
    { email: couple.partner1_email, name: `${couple.partner1_first} ${couple.partner1_last}`.trim() },
    { email: couple.partner2_email, name: `${couple.partner2_first} ${couple.partner2_last}`.trim() },
  ]
    .map((p) => ({ ...p, email: p.email.trim().toLowerCase() }))
    .filter((p, i, all) => p.email && all.findIndex((x) => x.email === p.email) === i);

  // Check every address first, so a clash leaves nothing half done.
  const store = getStore();
  for (const partner of partners) {
    const existing = await store.getUserByEmail(partner.email);
    if (existing && existing.role !== "couple") throw new Error(`${partner.email} heeft al een account in de Academy. Gebruik een ander e-mailadres.`);
    if (existing) {
      const member = await one<{ couple_id: string }>("select couple_id from members where user_id = $1", [existing.id]);
      if (member && member.couple_id !== couple.id) throw new Error(`${partner.email} hoort al bij een ander bruidspaar.`);
    }
  }

  const results: ShareResult[] = [];
  for (const partner of partners) {
    const before = await store.getUserByEmail(partner.email);
    const user = await ensureCoupleUser(partner.email, partner.name || partner.email);
    await query("insert into members (user_id, couple_id) values ($1, $2) on conflict (user_id) do nothing", [user.id, couple.id]);
    if (isActivated(user)) continue;
    results.push({ email: partner.email, link: await loginLink(user), isNew: !before });
  }
  await query("update couples set status = 'active', activated_at = coalesce(activated_at, now()) where id = $1", [couple.id]);
  return results;
}

export interface Member {
  id: string;
  email: string;
  name: string;
  activated: boolean;
  lastActiveAt: string | null;
}

/** The Academy accounts of a couple. */
export async function coupleMembers(coupleId: string): Promise<Member[]> {
  const rows = await query<{ user_id: string }>("select user_id from members where couple_id = $1 order by created_at", [coupleId]);
  const users = await Promise.all(rows.map((r) => getStore().getUser(r.user_id)));
  return users
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .map((u) => ({ id: u.id, email: u.email, name: u.name, activated: isActivated(u), lastActiveAt: u.lastActiveAt }));
}

export async function logActivity(coupleId: string | null, accountId: string | null, action: string) {
  await query("insert into activity (couple_id, account_id, action) values ($1, $2, $3)", [coupleId, accountId, action]);
}
