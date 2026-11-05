import "server-only";
import { one, query, tx } from "@/lib/db";
import type { Account, Couple, Package } from "@/lib/types";
import { createAccountLink } from "./accounts";
import { getSettings } from "./settings";

export interface CoupleListRow extends Couple {
  package_name: string | null;
  open_questions: number;
  open_sabine_tasks: number;
  last_activity: Date | null;
}

export async function listCouples(includeArchived = false): Promise<CoupleListRow[]> {
  return query<CoupleListRow>(
    `select c.*, p.name as package_name,
            (select count(*)::int from questions q where q.couple_id = c.id and q.answered_at is null) as open_questions,
            (select count(*)::int from tasks t where t.couple_id = c.id and t.lane = 'sabine' and t.done_at is null) as open_sabine_tasks,
            (select max(s.last_seen_at) from sessions s join accounts a on a.id = s.account_id where a.couple_id = c.id) as last_activity
       from couples c left join packages p on p.id = c.package_id
      where $1 or c.status <> 'archived'
      order by c.wedding_date nulls last, c.created_at`,
    [includeArchived],
  );
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
  package_id: string | null;
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
    const pkg = input.package_id ? await one<Package>("select * from packages where id = $1", [input.package_id], db) : null;
    const couple = await one<{ id: string }>(
      `insert into couples (partner1_first, partner1_last, partner1_email, partner1_phone,
                            partner2_first, partner2_last, partner2_email, partner2_phone,
                            address, wedding_date, wedding_date_confirmed, location, package_id, suppliers_enabled, welcome_text)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
      [
        input.partner1_first, input.partner1_last, input.partner1_email, input.partner1_phone,
        input.partner2_first, input.partner2_last, input.partner2_email, input.partner2_phone,
        input.address, input.wedding_date, input.wedding_date_confirmed, input.location,
        pkg?.id ?? null, pkg?.suppliers_enabled ?? true, settings.default_welcome,
      ],
      db,
    );
    const coupleId = couple!.id;

    if (pkg) {
      await query(
        `insert into tasks (couple_id, lane, title, position, created_by)
         select $1, lane, title, position, $3 from package_tasks where package_id = $2`,
        [coupleId, pkg.id, createdBy],
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
    return coupleId;
  });
}

export interface ShareResult {
  email: string;
  link: string;
  isNew: boolean;
}

/**
 * "Maak beschikbaar en deel": makes the portal visible and gives each partner
 * with an e-mail address an account with a one-time activation link.
 */
export async function activateCouple(couple: Couple): Promise<ShareResult[]> {
  const partners = [
    { email: couple.partner1_email, name: `${couple.partner1_first} ${couple.partner1_last}`.trim() },
    { email: couple.partner2_email, name: `${couple.partner2_first} ${couple.partner2_last}`.trim() },
  ]
    .map((p) => ({ ...p, email: p.email.trim().toLowerCase() }))
    .filter((p, i, all) => p.email && all.findIndex((x) => x.email === p.email) === i);

  return tx(async (db) => {
    await query("update couples set status = 'active', activated_at = coalesce(activated_at, now()) where id = $1", [couple.id], db);
    const results: ShareResult[] = [];
    for (const partner of partners) {
      let account = await one<Account>("select * from accounts where email = $1", [partner.email], db);
      if (account && account.couple_id !== couple.id) {
        throw new Error(`${partner.email} hoort al bij een ander account. Gebruik een ander e-mailadres.`);
      }
      const isNew = !account;
      account ??= await one<Account>(
        "insert into accounts (email, name, role, couple_id) values ($1, $2, 'couple', $3) returning *",
        [partner.email, partner.name || partner.email, couple.id],
        db,
      );
      // Someone who already chose a password gets no new invite.
      if (account!.password_hash && !isNew) continue;
      results.push({ email: partner.email, link: await createAccountLink(account!.id, "invite", db), isNew });
    }
    return results;
  });
}

export async function coupleAccounts(coupleId: string) {
  return query<{ id: string; email: string; name: string; password_hash: string | null; last_login_at: Date | null }>(
    "select id, email, name, password_hash, last_login_at from accounts where couple_id = $1 order by created_at",
    [coupleId],
  );
}

export async function logActivity(coupleId: string | null, accountId: string | null, action: string) {
  await query("insert into activity (couple_id, account_id, action) values ($1, $2, $3)", [coupleId, accountId, action]);
}
