"use server";

import { revalidatePath } from "next/cache";
import { requireCouple, requireCoupleAdmin } from "@/lib/ws/access";
import { coupleMembers, logActivity } from "@/lib/ws/couples";
import { isUuid, one } from "@/lib/ws/db";
import { formatDate } from "@/lib/ws/format";
import { appUrl, sendMail } from "@/lib/ws/mail";
import { eligibleStudents } from "@/lib/ws/meekijkers";
import { accessState, consentQuestion, draaiboekTitle, GRANT_CONFIRMATION, lastDay, type StoredAccessStatus } from "@/lib/ws/meekijkers-pure";
import { done, str } from "@/lib/ws/redirect";
import type { Couple } from "@/lib/ws/types";

/**
 * Meelopende cursist (feedback 13.5): only Sabine asks, only the couple
 * answers, both can take it back. Every action checks the role first.
 */

const adminPage = (coupleId: string) => `/k/${coupleId}/gegevens#meelopen`;
const couplePage = (coupleId: string) => `/k/${coupleId}#meekijkers`;

async function coupleRecipients(couple: Couple): Promise<string[]> {
  return [
    ...new Set(
      [...(await coupleMembers(couple.id)).map((a) => a.email), couple.partner1_email, couple.partner2_email]
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

/** 13.1 Sabine gives a student read access, subject to the couple's consent. */
export async function grantStudentAccess(formData: FormData) {
  const ctx = await requireCoupleAdmin(str(formData, "coupleId", 40));
  const back = adminPage(ctx.couple.id);
  const studentId = str(formData, "studentId", 40);
  if (formData.get("confirm") !== "on") done(back, `Vink eerst aan: "${GRANT_CONFIRMATION}"`, true);
  const student = (await eligibleStudents()).find((s) => s.id === studentId);
  if (!student) done(back, "Kies een cursist met pakket B en actieve toegang tot de Academy.", true);
  if (accessState({ status: "pending" }, ctx.couple.wedding_date) === "verlopen") {
    done(back, "De bruiloft is al meer dan 7 dagen geleden; toegang geven kan niet meer.", true);
  }
  const open = await one("select 1 from draaiboek_access where couple_id = $1 and student_user_id = $2 and status in ('pending', 'active')", [ctx.couple.id, student.id]);
  if (open) done(back, `${student.name} heeft al toegang of een openstaande vraag bij dit bruidspaar.`, true);
  const row = await one<{ id: string }>(
    `insert into draaiboek_access (couple_id, student_user_id, granted_by, granted_by_name)
     values ($1, $2, $3, $4) on conflict do nothing returning id`,
    [ctx.couple.id, student.id, isUuid(ctx.account.id) ? ctx.account.id : null, ctx.account.name],
  );
  if (!row) done(back, `${student.name} heeft al toegang of een openstaande vraag bij dit bruidspaar.`, true);

  // 13.2 The couple also gets the question by mail, with a link to their dashboard.
  let mailed = false;
  if (ctx.couple.status === "active") {
    const [question, allergies] = consentQuestion(student.name);
    mailed = await sendMail({
      to: await coupleRecipients(ctx.couple),
      subject: "Vraag van Sabine: mag een cursist meekijken in jullie draaiboek?",
      text: `Lieve ${[ctx.couple.partner1_first, ctx.couple.partner2_first].filter(Boolean).join(" en ")},\n\n${question}\n\n${allergies}\n\nJullie kunnen akkoord geven of liever niet kiezen op de startpagina van Your Wedding Space:\n${appUrl()}/k/${ctx.couple.id}#meekijkers\n\nLiefs,\nSabine`,
      log: { kind: "meekijker_vraag", coupleId: ctx.couple.id, sentBy: ctx.account.name },
    });
  }
  revalidatePath(`/k/${ctx.couple.id}`);
  done(
    back,
    ctx.couple.status !== "active"
      ? `Vraag klaargezet voor ${student.name}. Het bruidspaar ziet hem zodra het portaal gedeeld is (er is nog geen mail verstuurd).`
      : mailed
        ? `Vraag voor ${student.name} verstuurd. Status: wacht op akkoord bruidspaar.`
        : `Vraag voor ${student.name} staat op de startpagina van het bruidspaar. De mail kon niet worden verstuurd (zie Mails).`,
  );
}

/** 13.4 Sabine takes a request or access back. */
export async function revokeStudentAccessAdmin(formData: FormData) {
  const ctx = await requireCoupleAdmin(str(formData, "coupleId", 40));
  const accessId = str(formData, "accessId", 40);
  if (!isUuid(accessId)) done(adminPage(ctx.couple.id), "Niet gevonden.", true);
  const row = await one(
    `update draaiboek_access set status = 'revoked', revoked_at = now(), revoked_by = 'admin', revoked_by_name = $3
      where id = $1 and couple_id = $2 and status in ('pending', 'active') returning id`,
    [accessId, ctx.couple.id, ctx.account.name],
  );
  revalidatePath(`/k/${ctx.couple.id}`);
  done(adminPage(ctx.couple.id), row ? "Toegang ingetrokken." : "Deze toegang was al beëindigd.", !row);
}

/** 13.2 The couple answers: Akkoord or Liever niet. Only the couple's own login, never Sabine. */
export async function answerStudentAccess(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  const back = couplePage(ctx.couple.id);
  if (ctx.isAdmin) done(back, "Alleen het bruidspaar kan akkoord geven of weigeren.", true);
  const accessId = str(formData, "accessId", 40);
  const answer = str(formData, "answer", 20);
  if (!isUuid(accessId) || (answer !== "akkoord" && answer !== "liever_niet")) done(back, "Niet gevonden.", true);
  const current = await one<{ status: StoredAccessStatus }>("select status from draaiboek_access where id = $1 and couple_id = $2", [accessId, ctx.couple.id]);
  if (!current || accessState(current, ctx.couple.wedding_date) !== "wacht") done(back, "Deze vraag is niet meer open.", true);
  const approve = answer === "akkoord";
  // The moment and the login of the answer are kept for the records (13.5).
  const row = await one<{ student_user_id: string }>(
    `update draaiboek_access
        set status = $3, decided_at = now(), decided_by_user_id = $4, decided_by_name = $5, approved_at = case when $3 = 'active' then now() else null end
      where id = $1 and couple_id = $2 and status = 'pending' returning student_user_id`,
    [accessId, ctx.couple.id, approve ? "active" : "declined", ctx.account.id, ctx.account.name],
  );
  if (!row) done(back, "Deze vraag is niet meer open.", true);
  await logActivity(ctx.couple.id, ctx.account.id, approve ? "gaf een cursist leestoegang tot het draaiboek" : "wilde liever geen meelopende cursist");

  if (approve) {
    // 13.3 The student gets a mail as soon as the access is active.
    const student = await one<{ name: string; email: string }>("select name, email from public.users where id = $1", [row.student_user_id]);
    const until = lastDay(ctx.couple.wedding_date);
    if (student?.email) {
      await sendMail({
        to: student.email,
        subject: `${draaiboekTitle(ctx.couple)} staat voor je klaar`,
        text: `Hoi ${student.name.split(" ")[0]},\n\nHet bruidspaar heeft akkoord gegeven: je kunt nu meekijken in het draaiboek van hun bruiloft${ctx.couple.wedding_date ? ` op ${formatDate(ctx.couple.wedding_date)}` : ""}. Je vindt de knop op je dashboard in de Academy:\n${appUrl()}/dashboard\n\nHet draaiboek is alleen te lezen${until ? ` en blijft beschikbaar tot en met ${formatDate(until)}` : ""}. Ga er zorgvuldig mee om: het bevat ook allergieën en dieetwensen van gasten.\n\nLiefs,\nSabine`,
        log: { kind: "meekijker_toegang", coupleId: ctx.couple.id, guestName: student.name, sentBy: "Your Wedding Space" },
      });
    }
  }
  revalidatePath(`/k/${ctx.couple.id}`);
  done(back, approve ? "Dank jullie wel! De cursist kan nu meekijken in het draaiboek." : "Helemaal goed. De cursist krijgt geen toegang.");
}

/** 13.2 / 13.4 The couple takes their consent back via "Meekijkers". */
export async function revokeStudentAccessCouple(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  const back = couplePage(ctx.couple.id);
  if (ctx.isAdmin) done(back, "Intrekken als Sabine gaat via Gegevens & delen.", true);
  const accessId = str(formData, "accessId", 40);
  if (!isUuid(accessId)) done(back, "Niet gevonden.", true);
  const row = await one(
    `update draaiboek_access set status = 'revoked', revoked_at = now(), revoked_by = 'couple', revoked_by_name = $3
      where id = $1 and couple_id = $2 and status = 'active' returning id`,
    [accessId, ctx.couple.id, ctx.account.name],
  );
  if (row) await logActivity(ctx.couple.id, ctx.account.id, "trok de leestoegang van een cursist in");
  revalidatePath(`/k/${ctx.couple.id}`);
  done(back, row ? "Toestemming ingetrokken. De cursist kan het draaiboek niet meer bekijken." : "Deze toegang was al beëindigd.", !row);
}
