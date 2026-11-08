import "server-only";
import { isUuid, pool, query, tx, type Queryable } from "@/lib/db";
import { INZAGE_SECTIONS, inzageHtml, stripSecrets, type InzageSection } from "@/lib/domain/inzage";
import { portfolioFiles, portfolioHtml } from "@/lib/domain/portfolio";
import { safeFileName, uniqueNames } from "@/lib/domain/privacy";
import { filesForZip, loadPortfolio } from "@/lib/portfolio";
import { BUCKET, supabaseEnabled } from "@/lib/supabase/config";
import { adminClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/util/format";
import { createZip, type ZipEntry } from "@/lib/zip";
import type { User } from "./types";

/**
 * Academy 16: everything the app keeps about one student, as an export
 * (request for access) and as a permanent deletion. Sabine only; the server
 * action and the route check the role.
 */

type Row = Record<string, unknown>;

/** Mail history rows sent to this address (to_email is a comma separated list). */
const MAIL_MATCH = `exists (select 1 from unnest(string_to_array(lower(to_email), ',')) e where trim(e) = $1)`;

async function rows(sql: string, params: unknown[], db: Queryable = pool()): Promise<Row[]> {
  return (await db.query(sql, params)).rows.map(stripSecrets);
}

/** All personal data of one student, per section (see INZAGE_SECTIONS). */
export async function collectPersonalData(user: User): Promise<InzageSection[]> {
  const id = user.id;
  const p = [id];
  const data: Record<string, Row[]> = {
    account: await rows("select * from public.users where id = $1", p),
    profiel: await rows("select * from public.profiles where user_id = $1", p),
    inschrijving: await rows("select * from public.enrollments where user_id = $1", p),
    toegangsmeldingen: await rows("select * from public.access_notices where user_id = $1 order by sent_at", p),
    opdrachten: await rows("select * from public.assignment_submissions where user_id = $1 order by created_at", p),
    versies: await rows("select * from public.submission_versions where user_id = $1 order by submitted_at, version", p),
    feedback: await rows("select * from public.assignment_feedback where user_id = $1 order by created_at", p),
    oude_antwoorden: await rows("select * from public.answers where user_id = $1 order by created_at", p),
    oude_feedback: await rows("select * from public.feedback where user_id = $1 order by created_at", p),
    afgeronde_lessen: await rows(
      "select c.*, l.title as lesson_title from public.lesson_completions c left join public.lessons l on l.id = c.lesson_id where c.user_id = $1 order by c.completed_at",
      p,
    ),
    vrijgaven: await rows(
      "select u.*, m.title as module_title from public.module_unlocks u left join public.modules m on m.id = u.module_id where u.user_id = $1",
      p,
    ),
    community_berichten: await rows("select * from public.community_posts where author_id = $1 order by created_at", p),
    community_reacties: await rows("select * from public.community_comments where author_id = $1 order by created_at", p),
    community_meldingen: await rows("select * from public.community_reports where reporter_id = $1 order by created_at", p),
    privéberichten: await rows(
      `select m.*, case when m.author_id = m.student_id then 'cursist' else 'Sabine' end as geschreven_door
         from public.private_messages m where m.student_id = $1 order by m.created_at`,
      p,
    ),
    bijlagen: await rows("select * from public.community_attachments where uploader_id = $1 or conversation_id = $1 order by created_at", p),
    meldingsinstellingen: await rows("select * from public.community_members where user_id = $1", p),
    pushmeldingen: (await rows("select * from public.push_subscriptions where user_id = $1", p)).map((r) => ({
      ...r,
      // The endpoint is a personal address at the browser maker; the host is enough to recognise it.
      endpoint: typeof r.endpoint === "string" ? hostOf(r.endpoint) : r.endpoint,
    })),
    bestanden: await rows("select id, name, mime, size, belongs_to, uploaded_by, created_at from public.files where belongs_to = $1 or uploaded_by = $1 order by created_at", p),
    meekijken: await rows(
      `select a.*, c.wedding_date, (select array_agg(v.viewed_at order by v.viewed_at) from wedding_space.draaiboek_access_views v where v.access_id = a.id) as bekeken_op
         from wedding_space.draaiboek_access a left join wedding_space.couples c on c.id = a.couple_id where a.student_user_id = $1 order by a.created_at`,
      p,
    ).catch(() => []),
    mails: await rows(`select * from wedding_space.mail_log where ${MAIL_MATCH} order by created_at`, [user.email.toLowerCase()]).catch(() => []),
    logboek: await rows("select * from public.audit_log where target_user_id = $1 or actor_id = $1 order by at", p),
    beveiliging: [
      ...(await rows("select 'passkey' as soort, * from public.passkeys where user_id = $1", p)),
      ...(await rows("select 'koppeling' as soort, * from public.oauth_grants where user_id = $1", p)),
      ...(await rows("select 'mcp' as soort, * from public.mcp_settings where user_id = $1", p)),
    ],
  };
  return INZAGE_SECTIONS.map((s) => ({ ...s, rows: data[s.key] ?? [] }));
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/**
 * The export zip: overzicht.html (readable), gegevens.json (the same, as
 * data), portfolio.html (the assignments as in the portfolio) and every file
 * in the folder bestanden.
 */
export async function inzageZip(user: User): Promise<{ data: Buffer; fileName: string }> {
  const now = new Date().toISOString();
  const [sections, portfolio] = await Promise.all([collectPersonalData(user), loadPortfolio(user.id, "owner")]);
  const inPortfolio = portfolioFiles(portfolio);
  const portfolioIds = new Set(inPortfolio.map((f) => f.file.id));
  const others = (sections.find((s) => s.key === "bestanden")?.rows ?? []).filter((r) => !portfolioIds.has(String(r.id)));
  const otherNames = uniqueNames(others.map((r) => String(r.name ?? "bestand")));
  const pathById = new Map(inPortfolio.map((f) => [f.file.id, f.path]));
  const html = portfolioHtml(portfolio, {
    studentName: user.name,
    generatedAt: now,
    formatDate: formatDateTime,
    hrefFor: (file) => encodeURI(pathById.get(file.id) ?? ""),
  });
  const entries: ZipEntry[] = [
    { name: "overzicht.html", data: Buffer.from(inzageHtml(sections, { name: user.name, generatedAt: now, formatDate: formatDateTime }), "utf8"), compress: true },
    { name: "gegevens.json", data: Buffer.from(JSON.stringify({ gemaakt_op: now, persoon: user.email, onderdelen: sections }, null, 2), "utf8"), compress: true },
    { name: "portfolio.html", data: Buffer.from(html, "utf8"), compress: true },
    ...(await filesForZip([
      ...inPortfolio.map((f) => ({ id: f.file.id, path: f.path })),
      ...others.map((r, i) => ({ id: String(r.id), path: `bestanden/overig/${otherNames[i]}` })),
    ])),
  ];
  return { data: createZip(entries), fileName: `${safeFileName(`Gegevens ${user.name}`)} ${now.slice(0, 10)}.zip` };
}

// Deleting -------------------------------------------------------------------------------

export interface DeletionResult {
  files: number;
  /** Problems with Storage or Supabase Auth after the data itself was deleted. */
  warnings: string[];
}

/**
 * Deletes a student for good: every row about the person, every file
 * (Postgres or Supabase Storage) and the login. Community posts and comments
 * of the student are deleted, together with the reactions of others under
 * those posts and their attachments. Meekijktoegang, push subscriptions,
 * notices, mails in the history and log lines about the person go as well.
 * One log line without personal data stays ("Cursist definitief verwijderd").
 */
export async function deleteStudent(userId: string, ownerId: string): Promise<DeletionResult | null> {
  if (!isUuid(userId)) return null;
  const removed = await tx(async (db) => {
    const { rows: found } = await db.query<{ email: string }>(
      "select email from public.users where id = $1 and role = 'student' for update",
      [userId],
    );
    if (!found[0]) return null;
    const email = found[0].email.toLowerCase();
    const { rows: files } = await db.query<{ id: string; in_bucket: boolean }>(
      `select id, data is null as in_bucket from public.files
        where belongs_to = $1 or uploaded_by = $1
           or id in (select a.file_id from public.community_attachments a
                      where a.post_id in (select id from public.community_posts where author_id = $1)
                         or a.comment_id in (select c.id from public.community_comments c
                                               join public.community_posts p on p.id = c.post_id where p.author_id = $1))`,
      [userId],
    );
    await db.query(`delete from wedding_space.mail_log where ${MAIL_MATCH}`, [email]);
    await db.query("delete from public.audit_log where target_user_id = $1 or actor_id = $1", [userId]);
    // Posts take their comments (also of others), reports and attachment rows with them.
    await db.query("delete from public.community_posts where author_id = $1", [userId]);
    await db.query("delete from public.files where id = any($1::uuid[])", [files.map((f) => f.id)]);
    // Everything else hangs on public.users with on delete cascade (profile, enrollment,
    // assignments, versions, feedback, completions, comments, private messages, settings,
    // push subscriptions, access notices, meekijktoegang and its views, passkeys).
    await db.query("delete from public.users where id = $1", [userId]);
    if (!supabaseEnabled()) await db.query("delete from auth.users where id = $1", [userId]);
    await db.query(
      "insert into public.audit_log (actor_id, target_user_id, action, details) values ($1, null, 'Cursist definitief verwijderd', $2)",
      [ownerId, `${files.length} ${files.length === 1 ? "bestand" : "bestanden"} verwijderd`],
    );
    return files;
  });
  if (!removed) return null;

  const warnings: string[] = [];
  if (supabaseEnabled()) {
    const inBucket = removed.filter((f) => f.in_bucket).map((f) => f.id);
    for (let i = 0; i < inBucket.length; i += 100) {
      const { error } = await adminClient().storage.from(BUCKET).remove(inBucket.slice(i, i + 100));
      if (error) warnings.push(`Niet alle bestanden konden uit Supabase Storage worden verwijderd (${error.message}).`);
    }
    const { error } = await adminClient().auth.admin.deleteUser(userId);
    if (error && !/not.?found/i.test(error.message)) warnings.push(`Het inlogaccount in Supabase kon niet worden verwijderd (${error.message}).`);
  }
  return { files: removed.length, warnings };
}

/** For the tests and the student page: whether anything is left of a person. */
export async function remainingRows(userId: string): Promise<number> {
  const [r] = await query<{ n: number }>(
    `select (select count(*) from public.users where id = $1)
          + (select count(*) from public.files where belongs_to = $1 or uploaded_by = $1)
          + (select count(*) from public.assignment_submissions where user_id = $1)
          + (select count(*) from public.private_messages where student_id = $1)
          + (select count(*) from public.community_posts where author_id = $1)
          + (select count(*) from public.audit_log where target_user_id = $1 or actor_id = $1) as n`,
    [userId],
  );
  return Number(r?.n ?? 0);
}
