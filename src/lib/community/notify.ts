import "server-only";
import { pool, query } from "@/lib/db";
import { getStore } from "@/lib/data";
import { accessStatus } from "@/lib/domain/access";
import { appUrl, sendMail } from "@/lib/ws/mail";
import { pushTo } from "./push";
import { removeUnpostedUploads } from "./server";
import { canReadConversation, canUseCommunity, mailDue, newsSince, preview, pushDue, type Viewer } from "./rules";

/**
 * Notifications of the community and the private messages.
 *
 * E-mail is bundled (rules.ts, MAIL_WINDOWS): at most one community mail per
 * person per hour and one private-message mail per quarter of an hour, only
 * about what that person has not seen yet, and only when the person has
 * mail on (profile). There is no cron: processNotifications runs
 *   - right after every new post, comment or private message (so the first
 *     news after a quiet window goes out at once),
 *   - lazily, at most once a minute, when anyone opens a page of the
 *     Academy or the admin (kickNotifications in the layouts),
 *   - and from GET/POST /api/community/meldingen with COMMUNITY_CRON_SECRET,
 *     for a host that can call a URL periodically.
 * A Postgres advisory lock keeps two runs from mailing the same news twice.
 *
 * Push goes out directly (rules.ts, pushDue: community at most once an hour
 * per person, private messages always).
 */

const LOCK = 727301;

const state = globalThis as unknown as { __communityKick?: number };

/** Lazily, at most once a minute per server process. Never throws. */
export function kickNotifications() {
  const now = Date.now();
  if (state.__communityKick && now - state.__communityKick < 60_000) return;
  state.__communityKick = now;
  void processNotifications().catch((err) => console.error(`[community] meldingen: ${(err as Error).message}`));
}

interface Person {
  id: string;
  email: string;
  name: string;
  role: "student" | "owner";
  email_enabled: boolean | null;
  community_seen_at: Date | null;
  community_mailed_at: Date | null;
  community_mailed_until: Date | null;
  private_mailed_at: Date | null;
  private_mailed_until: Date | null;
  has_member: boolean;
}

const asIso = (d: Date | null) => (d ? d.toISOString() : null);
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

async function viewersById(): Promise<Map<string, Viewer["access"]>> {
  const enrollments = await getStore().listEnrollments();
  const now = new Date();
  return new Map(enrollments.map((e) => [e.userId, accessStatus(e, now)]));
}

/** Sends the mails that are due. Returns how many went out. */
export async function processNotifications(now = new Date()): Promise<{ community: number; private: number } | null> {
  const client = await pool().connect();
  try {
    const { rows } = await client.query<{ ok: boolean }>("select pg_try_advisory_lock($1) as ok", [LOCK]);
    if (!rows[0]?.ok) return null;
    try {
      const result = await run(now);
      await removeUnpostedUploads().catch((err) => console.error(`[community] opruimen: ${(err as Error).message}`));
      return result;
    } finally {
      await client.query("select pg_advisory_unlock($1)", [LOCK]);
    }
  } finally {
    client.release();
  }
}

async function run(now: Date) {
  const access = await viewersById();
  const people = await query<Person>(
    `select u.id, u.email, u.name, u.role::text as role, m.email_enabled, m.community_seen_at, m.community_mailed_at,
            m.community_mailed_until, m.private_mailed_at, m.private_mailed_until, m.user_id is not null as has_member
       from public.users u left join public.community_members m on m.user_id = u.id
      where u.role::text in ('student', 'owner') and u.activated_at is not null`,
  );
  let community = 0;
  let privateCount = 0;
  for (const person of people) {
    // First time: everything up to now counts as mailed, so nobody gets the whole history.
    if (!person.has_member) {
      await query(
        `insert into public.community_members (user_id, community_mailed_until, private_mailed_until) values ($1, now(), now())
         on conflict (user_id) do nothing`,
        [person.id],
      );
      continue;
    }
    if (person.email_enabled === false) continue;
    const viewer: Viewer = { id: person.id, role: person.role, access: person.role === "owner" ? "active" : (access.get(person.id) ?? "none") };
    if (await mailCommunity(person, viewer, now)) community++;
    if (await mailPrivate(person, viewer, now)) privateCount++;
  }
  return { community, private: privateCount };
}

async function mailCommunity(person: Person, viewer: Viewer, now: Date): Promise<boolean> {
  if (!canUseCommunity(viewer)) return false;
  const since = newsSince(asIso(person.community_seen_at), asIso(person.community_mailed_until));
  const items = await query<{ kind: string; name: string; body: string; created_at: Date }>(
    `select * from (
       select 'post' as kind, u.name, p.body, p.created_at from public.community_posts p join public.users u on u.id = p.author_id
        where p.author_id <> $1 and p.hidden_at is null and p.created_at > $2
       union all
       select 'comment' as kind, u.name, c.body, c.created_at from public.community_comments c
         join public.community_posts p on p.id = c.post_id join public.users u on u.id = c.author_id
        where c.author_id <> $1 and c.hidden_at is null and p.hidden_at is null and c.created_at > $2
     ) news order by created_at`,
    [person.id, since],
  );
  if (!mailDue({ channel: "community", lastMailedAt: asIso(person.community_mailed_at), newItems: items.length, now })) return false;
  const shown = items.slice(-8);
  const lines = shown.map((i) => `- ${i.name}${i.kind === "comment" ? " reageerde" : ""}: ${preview(i.body, 120) || "(foto, video of bestand)"}`);
  if (items.length > shown.length) lines.unshift(`(en nog ${items.length - shown.length} eerder)`);
  const base = appUrl();
  const path = person.role === "owner" ? "/beheer/community" : "/community";
  const profile = person.role === "owner" ? "/beheer/profiel" : "/profiel";
  const sent = await sendMail({
    to: person.email,
    subject: items.length === 1 ? "Nieuw bericht in de community" : `${items.length} nieuwe berichten in de community`,
    text: [
      `Hoi ${firstName(person.name)},`,
      "Er is nieuws in de community van de Wedding Plan Academy:",
      lines.join("\n"),
      `Bekijk het hier: ${base}${path}`,
      `Je krijgt hierover hoogstens één mail per uur. Liever geen mails? Zet ze uit op je profiel: ${base}${profile}`,
    ].join("\n\n"),
    log: { kind: "community" },
  });
  // Also when sending failed: the news stays in the community and the counter; no retry storm.
  const until = items[items.length - 1].created_at;
  await query(`update public.community_members set community_mailed_at = $2, community_mailed_until = $3 where user_id = $1`, [
    person.id,
    now,
    until,
  ]);
  return sent;
}

async function mailPrivate(person: Person, viewer: Viewer, now: Date): Promise<boolean> {
  const own = person.role === "owner";
  if (!own && !canReadConversation(viewer, person.id)) return false;
  const since = newsSince(asIso(person.private_mailed_until));
  const items = await query<{ name: string; created_at: Date }>(
    own
      ? `select u.name, m.created_at from public.private_messages m join public.users u on u.id = m.student_id
          where m.author_id = m.student_id and m.read_at is null and m.created_at > $1 order by m.created_at`
      : `select u.name, m.created_at from public.private_messages m join public.users u on u.id = m.author_id
          where m.student_id = $2 and m.author_id <> $2 and m.read_at is null and m.created_at > $1 order by m.created_at`,
    own ? [since] : [since, person.id],
  );
  if (!mailDue({ channel: "private", lastMailedAt: asIso(person.private_mailed_at), newItems: items.length, now })) return false;
  const base = appUrl();
  const names = [...new Set(items.map((i) => i.name))];
  // Never the content of a private message in a mail: only that there is one.
  const sent = await sendMail({
    to: person.email,
    subject: own
      ? `Nieuw privébericht van ${names.length === 1 ? names[0] : `${names.length} cursisten`}`
      : "Je hebt een nieuw privébericht van Sabine",
    text: own
      ? [
          `Hoi ${firstName(person.name)},`,
          `Je hebt ${items.length === 1 ? "een nieuw privébericht" : `${items.length} nieuwe privéberichten`} van: ${names.join(", ")}.`,
          `Lees en beantwoord ze in het beheer: ${base}/beheer/berichten`,
        ].join("\n\n")
      : [
          `Hoi ${firstName(person.name)},`,
          `Sabine heeft je ${items.length === 1 ? "een privébericht" : `${items.length} privéberichten`} gestuurd in de Wedding Plan Academy.`,
          `Lees het hier: ${base}/prive-chat`,
          `Liever geen mails? Zet ze uit op je profiel: ${base}/profiel`,
        ].join("\n\n"),
    log: { kind: "privebericht", sensitive: false },
  });
  await query(`update public.community_members set private_mailed_at = $2, private_mailed_until = $3 where user_id = $1`, [
    person.id,
    now,
    items[items.length - 1].created_at,
  ]);
  return sent;
}

// Push --------------------------------------------------------------------------------------------

/** After a new post or comment: everyone in the community except the author, at most once an hour each. */
export async function pushCommunity(authorId: string, authorName: string, kind: "post" | "comment") {
  const access = await viewersById();
  const now = new Date();
  const rows = await query<{ id: string; role: "student" | "owner"; community_pushed_at: Date | null }>(
    `select u.id, u.role::text as role, m.community_pushed_at
       from public.users u join public.push_subscriptions s on s.user_id = u.id
       left join public.community_members m on m.user_id = u.id
      where u.id <> $1 and u.role::text in ('student', 'owner')
      group by u.id, u.role, m.community_pushed_at`,
    [authorId],
  );
  const due = rows.filter((r) => {
    const viewer: Viewer = { id: r.id, role: r.role, access: r.role === "owner" ? "active" : (access.get(r.id) ?? "none") };
    return canUseCommunity(viewer) && pushDue(asIso(r.community_pushed_at), now);
  });
  if (due.length === 0) return;
  const owners = due.filter((r) => r.role === "owner").map((r) => r.id);
  const students = due.filter((r) => r.role === "student").map((r) => r.id);
  const message = {
    title: "Community",
    body: kind === "post" ? `${authorName} plaatste een nieuw bericht.` : `${authorName} reageerde op een bericht.`,
    tag: "community",
  };
  await Promise.all([
    pushTo(owners, { ...message, url: "/beheer/community" }),
    pushTo(students, { ...message, url: "/community" }),
  ]);
  await query(
    `insert into public.community_members (user_id, community_pushed_at, community_mailed_until, private_mailed_until)
     select unnest($1::uuid[]), now(), now(), now()
     on conflict (user_id) do update set community_pushed_at = now()`,
    [due.map((r) => r.id)],
  );
}

/** After a private message: the student, or Sabine. Never the content. */
export async function pushPrivate(studentId: string, fromOwner: boolean, authorName: string) {
  if (fromOwner) {
    await pushTo([studentId], { title: "Privébericht", body: "Sabine heeft je een bericht gestuurd.", url: "/prive-chat", tag: "prive" });
    return;
  }
  const owners = await query<{ id: string }>(`select id from public.users where role::text = 'owner'`);
  await pushTo(
    owners.map((o) => o.id),
    { title: "Privébericht", body: `Nieuw bericht van ${authorName}.`, url: `/beheer/berichten/${studentId}`, tag: `prive-${studentId}` },
  );
}

/** A report goes to Sabine straight away (mail and push), regardless of the bundling. */
export async function notifyReport(reporterName: string, excerpt: string) {
  const owners = await query<{ id: string; email: string; email_enabled: boolean | null }>(
    `select u.id, u.email, m.email_enabled from public.users u left join public.community_members m on m.user_id = u.id
      where u.role::text = 'owner'`,
  );
  const base = appUrl();
  await Promise.all(
    owners
      .filter((o) => o.email_enabled !== false)
      .map((o) =>
        sendMail({
          to: o.email,
          subject: "Melding in de community",
          text: [
            "Hoi Sabine,",
            `${reporterName} heeft een bericht in de community gemeld:`,
            `"${preview(excerpt, 200)}"`,
            `Bekijk de melding: ${base}/beheer/community`,
          ].join("\n\n"),
          log: { kind: "community" },
        }),
      ),
  );
  await pushTo(
    owners.map((o) => o.id),
    { title: "Melding in de community", body: `${reporterName} heeft een bericht gemeld.`, url: "/beheer/community", tag: "melding" },
  );
}
