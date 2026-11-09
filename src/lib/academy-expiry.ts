import "server-only";
import { pool } from "@/lib/db";
import { getStore } from "@/lib/data";
import { dueNotice, jobDue, EXPIRY_JOB_INTERVAL_MS, type ExpiryThreshold } from "@/lib/domain/expiry";
import { formatDate } from "@/lib/util/format";
import { appUrl, sendMail } from "@/lib/ws/mail";

/**
 * Mails before access ends (Academy 12): 30 and 7 days before the end date,
 * each once per end date (public.access_notices, migration 0029). There is
 * no cron, so processExpiryNotices runs
 *   - lazily on page views in the Academy and the admin (kickExpiryNotices),
 *     at most once an hour: per server process in memory, and across
 *     processes through public.academy_jobs;
 *   - from GET/POST /api/academy/toegang-meldingen with the cron secret.
 * A Postgres advisory lock keeps two runs from mailing twice.
 */

const LOCK = 727302;
const JOB = "toegang-meldingen";

const state = globalThis as unknown as { __expiryKick?: number };

/** Lazily, at most once an hour per server process. Never throws. */
export function kickExpiryNotices() {
  const now = Date.now();
  if (state.__expiryKick && now - state.__expiryKick < EXPIRY_JOB_INTERVAL_MS) return;
  state.__expiryKick = now;
  void processExpiryNotices().catch((err) => console.error(`[toegang] meldingen: ${(err as Error).message}`));
}

export interface ExpiryRun {
  mailed: number;
  skipped: boolean;
}

/**
 * Sends the notices that are due. `force` ignores the hourly limit (the
 * endpoint and the tests); the lock is always taken. Returns null when
 * another run holds the lock.
 */
export async function processExpiryNotices(now = new Date(), force = false): Promise<ExpiryRun | null> {
  const client = await pool().connect();
  try {
    const { rows } = await client.query<{ ok: boolean }>("select pg_try_advisory_lock($1) as ok", [LOCK]);
    if (!rows[0]?.ok) return null;
    try {
      const last = await client.query<{ ran_at: Date }>("select ran_at from public.academy_jobs where name = $1", [JOB]);
      if (!force && !jobDue(last.rows[0]?.ran_at ?? null, now)) return { mailed: 0, skipped: true };
      await client.query(
        "insert into public.academy_jobs (name, ran_at) values ($1, $2) on conflict (name) do update set ran_at = excluded.ran_at",
        [JOB, now],
      );
      return { mailed: await run(now), skipped: false };
    } finally {
      await client.query("select pg_advisory_unlock($1)", [LOCK]);
    }
  } finally {
    client.release();
  }
}

async function run(now: Date): Promise<number> {
  const store = getStore();
  const [enrollments, students, settings] = await Promise.all([store.listEnrollments(), store.listUsers("student"), store.getSettings()]);
  const userById = new Map(students.map((u) => [u.id, u]));
  let mailed = 0;
  for (const enrollment of enrollments) {
    const user = userById.get(enrollment.userId);
    // Only activated accounts: someone who never logged in gets no reminder about an account they do not use.
    if (!user?.activatedAt) continue;
    const { rows } = await pool().query<{ threshold: number }>(
      "select threshold from public.access_notices where user_id = $1 and ends_at = $2",
      [user.id, enrollment.endsAt],
    );
    const decision = dueNotice(enrollment, rows.map((r) => r.threshold), now);
    if (decision.record.length === 0) continue;
    // Record first (one mail per threshold, also when sending fails), then send.
    const inserted = await pool().query(
      `insert into public.access_notices (user_id, threshold, ends_at, sent_at)
       select $1, t, $2, $3 from unnest($4::int[]) t on conflict do nothing returning threshold`,
      [user.id, enrollment.endsAt, now, decision.record],
    );
    if (!decision.send || !inserted.rows.some((r: { threshold: number }) => r.threshold === decision.send)) continue;
    const ok = await sendMail({
      to: user.email,
      subject: expirySubject(decision.send),
      text: expiryText(user.name, decision.send, enrollment.endsAt, settings.contactEmail),
      log: { kind: "toegang" },
    });
    if (ok) {
      mailed++;
      await pool().query("update public.access_notices set mailed = true where user_id = $1 and threshold = $2 and ends_at = $3", [
        user.id,
        decision.send,
        enrollment.endsAt,
      ]);
    }
  }
  return mailed;
}

export const expirySubject = (threshold: ExpiryThreshold) =>
  threshold === 30 ? "Je toegang tot de Future Weddings Academy loopt over een maand af" : "Je toegang tot de Future Weddings Academy loopt over een week af";

export function expiryText(name: string, threshold: ExpiryThreshold, endsAt: string, contactEmail: string): string {
  const base = appUrl();
  const first = name.trim().split(/\s+/)[0] || name;
  return [
    `Hoi ${first},`,
    `Je toegang tot de Future Weddings Academy loopt af op ${formatDate(endsAt)} (${threshold === 30 ? "binnen een maand" : "binnen een week"}).`,
    `Wil je je opdrachten, antwoorden, bestanden en feedback bewaren? Download dan vóór die datum je portfolio: ${base}/portfolio`,
    contactEmail ? `Wil je langer toegang? Mail Sabine: ${contactEmail}` : "Wil je langer toegang? Neem dan contact op met Sabine.",
    "Hartelijke groet,\nEstasi Weddings",
  ].join("\n\n");
}
