import "server-only";
import { notFound } from "next/navigation";
import { requireStudent } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { isUuid, one, query } from "./db";
import { PRINT_COUPLE_COLUMNS, type PrintCouple } from "./draaiboek-print";
import { accessState, canView, eligibleStudent, type AccessState, type StoredAccessStatus } from "./meekijkers-pure";

/**
 * Meelopende cursist (feedback 13): a student with package B reads one
 * couple's run sheet after the couple agreed, until 7 days after the wedding.
 * The state is worked out on every request (src/lib/ws/meekijkers-pure.ts).
 */

export interface AccessRow {
  id: string;
  couple_id: string;
  student_user_id: string;
  student_name: string;
  student_email: string;
  status: StoredAccessStatus;
  granted_by_name: string;
  created_at: Date;
  decided_at: Date | null;
  decided_by_name: string;
  approved_at: Date | null;
  revoked_at: Date | null;
  revoked_by: "admin" | "couple" | null;
  revoked_by_name: string;
  views: number;
  last_viewed_at: Date | null;
}

export type AccessWithState = AccessRow & { state: AccessState };

const ACCESS_SELECT = `
  select a.id, a.couple_id, a.student_user_id, coalesce(u.name, 'Onbekende cursist') as student_name, coalesce(u.email, '') as student_email,
         a.status, a.granted_by_name, a.created_at, a.decided_at, a.decided_by_name, a.approved_at, a.revoked_at, a.revoked_by, a.revoked_by_name,
         (select count(*)::int from draaiboek_access_views v where v.access_id = a.id) as views,
         (select max(v.viewed_at) from draaiboek_access_views v where v.access_id = a.id) as last_viewed_at
    from draaiboek_access a left join public.users u on u.id = a.student_user_id`;

/** Every request and access of one couple, newest first, with its state. */
export async function accessesForCouple(coupleId: string, weddingDate: string | null): Promise<AccessWithState[]> {
  const rows = await query<AccessRow>(`${ACCESS_SELECT} where a.couple_id = $1 order by a.created_at desc`, [coupleId]);
  return rows.map((r) => ({ ...r, state: accessState(r, weddingDate) }));
}

/** The latest openings of one access, for Sabine (health data: every view is kept). */
export const recentViews = (accessIds: string[]) =>
  accessIds.length
    ? query<{ access_id: string; viewed_at: Date }>(
        `select access_id, viewed_at from (
           select access_id, viewed_at, row_number() over (partition by access_id order by viewed_at desc) as n
             from draaiboek_access_views where access_id = any($1::uuid[])) x
          where n <= 10 order by viewed_at desc`,
        [accessIds],
      )
    : Promise.resolve([]);

/** Academy students Sabine can choose: package B with access that is active now. */
export async function eligibleStudents(): Promise<{ id: string; name: string; email: string }[]> {
  const rows = await query<{ id: string; name: string; email: string; package: string; revoked_at: Date | null; paused_at: Date | null; ends_at: Date }>(
    `select u.id, u.name, u.email, e.package::text as package, e.revoked_at, e.paused_at, e.ends_at
       from public.users u join public.enrollments e on e.user_id = u.id
      where u.role = 'student' order by u.name`,
  );
  return rows
    .filter((r) => eligibleStudent({ package: r.package, revokedAt: iso(r.revoked_at), pausedAt: iso(r.paused_at), endsAt: iso(r.ends_at)! }))
    .map(({ id, name, email }) => ({ id, name, email }));
}

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

/** Whether this student may walk along right now (package B, Academy access active). */
export async function studentIsEligible(userId: string): Promise<boolean> {
  return eligibleStudent(await getStore().getEnrollmentForUser(userId));
}

/** The run sheets the student can open now, for the buttons on the Academy dashboard. */
export async function viewableForStudent(userId: string): Promise<{ id: string; couple: PrintCouple }[]> {
  if (!(await studentIsEligible(userId))) return [];
  const rows = await query<PrintCouple & { access_id: string; status: StoredAccessStatus }>(
    `select a.id as access_id, a.status, ${PRINT_COUPLE_COLUMNS.split(", ").map((c) => `c.${c}`).join(", ")}
       from draaiboek_access a join couples c on c.id = a.couple_id
      where a.student_user_id = $1 and a.status = 'active' and c.status = 'active'
      order by c.wedding_date nulls last`,
    [userId],
  );
  return rows
    .filter((r) => canView(accessState(r, r.wedding_date)))
    .map((r) => ({ id: r.access_id, couple: { id: r.id, partner1_first: r.partner1_first, partner2_first: r.partner2_first, wedding_date: r.wedding_date, location: r.location } }));
}

/**
 * The one gate in front of the student's run sheet and its images: the
 * signed-in student, their own access, the couple agreed, not revoked or
 * expired, and still package B with active Academy access. Anything else is
 * "not found", so an id reveals nothing.
 */
export async function requireStudentAccess(accessId: unknown): Promise<{ accessId: string; couple: PrintCouple }> {
  const user = await requireStudent();
  const access = await checkStudentAccess(user.id, accessId);
  if (!access) notFound();
  return access;
}

/** The same check without redirects, for the image route. */
export async function checkStudentAccess(userId: string, accessId: unknown): Promise<{ accessId: string; couple: PrintCouple } | null> {
  if (!isUuid(accessId)) return null;
  const row = await one<PrintCouple & { status: StoredAccessStatus; couple_status: string }>(
    `select a.status, c.status as couple_status, ${PRINT_COUPLE_COLUMNS.split(", ").map((c) => `c.${c}`).join(", ")}
       from draaiboek_access a join couples c on c.id = a.couple_id
      where a.id = $1 and a.student_user_id = $2`,
    [accessId, userId],
  );
  if (!row || row.couple_status !== "active" || !canView(accessState(row, row.wedding_date))) return null;
  if (!(await studentIsEligible(userId))) return null;
  return {
    accessId,
    couple: { id: row.id, partner1_first: row.partner1_first, partner2_first: row.partner2_first, wedding_date: row.wedding_date, location: row.location },
  };
}

/** Every time the student opens the run sheet (it holds allergies and diets: health data). */
export async function logView(accessId: string) {
  await query("insert into draaiboek_access_views (access_id) values ($1)", [accessId]);
}

/** A file the student's run sheet shows: styling images of that couple (and its cover photo). Nothing else. */
export async function printFileOfCouple(coupleId: string, fileId: unknown): Promise<boolean> {
  if (!isUuid(fileId)) return false;
  return Boolean(
    await one(
      `select 1 where exists (select 1 from styling_place_images where couple_id = $1 and file_id = $2)
                   or exists (select 1 from couples where id = $1 and cover_file_id = $2)`,
      [coupleId, fileId],
    ),
  );
}
