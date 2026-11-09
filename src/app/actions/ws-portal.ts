"use server";

import { isUuid, one, query, tx } from "@/lib/ws/db";
import { requireCouple, requireCoupleAdmin, type CoupleContext } from "@/lib/ws/access";
import { coupleMembers, logActivity } from "@/lib/ws/couples";
import { deleteFiles, storeUpload, UploadError } from "@/lib/ws/files";
import { coupleName, formatDate, LANES } from "@/lib/ws/format";
import { sabineAddress, appUrl, sendMail } from "@/lib/ws/mail";
import { dateField, done, str } from "@/lib/ws/redirect";
import type { Lane } from "@/lib/ws/types";

const portal = (coupleId: string, sub = "") => `/k/${coupleId}${sub}`;

async function ctxFrom(formData: FormData): Promise<CoupleContext> {
  return requireCouple(str(formData, "coupleId", 40));
}

/** Who did it, for Sabine's activity overview (her own actions are not logged). */
async function note(ctx: CoupleContext, action: string) {
  if (!ctx.isAdmin) await logActivity(ctx.couple.id, ctx.account.id, action);
}

// Tasks -------------------------------------------------------------------------------

export async function addTask(formData: FormData) {
  const ctx = await ctxFrom(formData);
  const lane = str(formData, "lane") as Lane;
  const title = str(formData, "title", 200);
  const back = portal(ctx.couple.id, "#takenlijst");
  if (!LANES.includes(lane)) done(back, "Kies een kolom.", true);
  if (!title) done(back, "Geef de taak een naam.", true);
  await query(
    `insert into tasks (couple_id, lane, title, deadline, position, created_by)
     values ($1, $2, $3, $4, coalesce((select max(position) + 1 from tasks where couple_id = $1 and lane = $2), 1), $5)`,
    [ctx.couple.id, lane, title, dateField(formData, "deadline"), ctx.account.id],
  );
  await note(ctx, `Taak toegevoegd: ${title}`);
  done(back, "Taak toegevoegd.");
}

export async function toggleTask(formData: FormData) {
  const ctx = await ctxFrom(formData);
  const id = str(formData, "taskId", 40);
  if (!isUuid(id)) done(portal(ctx.couple.id), "Taak niet gevonden.", true);
  const task = await one<{ title: string; done_at: Date | null }>(
    `update tasks set done_at = case when done_at is null then now() else null end,
                      done_by = case when done_at is null then $3::text else null end,
                      done_by_name = case when done_at is null then $4 else '' end
      where id = $1 and couple_id = $2 returning title, done_at`,
    [id, ctx.couple.id, ctx.account.id, ctx.account.name],
  );
  if (!task) done(portal(ctx.couple.id), "Taak niet gevonden.", true);
  await note(ctx, task.done_at ? `Taak afgevinkt: ${task.title}` : `Taak teruggezet: ${task.title}`);
  const back = str(formData, "back", 200);
  done(back.startsWith("/") && !back.startsWith("//") ? back : portal(ctx.couple.id, "#takenlijst"), task.done_at ? "Taak afgevinkt. Je vindt hem terug onder Geschiedenis." : "Taak staat weer open.");
}

export async function deleteTask(formData: FormData) {
  const ctx = await ctxFrom(formData);
  const id = str(formData, "taskId", 40);
  if (isUuid(id)) await query("delete from tasks where id = $1 and couple_id = $2", [id, ctx.couple.id]);
  done(portal(ctx.couple.id, "#takenlijst"), "Taak verwijderd.");
}

// Questions ---------------------------------------------------------------------------

export async function askQuestion(formData: FormData) {
  const ctx = await ctxFrom(formData);
  const body = str(formData, "body", 4000);
  const back = portal(ctx.couple.id, "#vragenblok");
  if (!body) done(back, "Typ eerst je vraag.", true);
  await query("insert into questions (couple_id, body, asked_by, asked_by_name) values ($1, $2, $3, $4)", [ctx.couple.id, body, ctx.account.id, ctx.account.name]);
  await note(ctx, "Nieuwe vraag gesteld");
  if (!ctx.isAdmin) {
    await sendMail({
      to: await sabineAddress(),
      replyTo: ctx.account.email,
      subject: `Nieuwe vraag van ${coupleName(ctx.couple)}`,
      log: { kind: "vraag", coupleId: ctx.couple.id, sentBy: ctx.account.name },
      text: `${ctx.account.name} stelde een vraag in Your Wedding Space:\n\n${body}\n\nBeantwoorden: ${appUrl()}${back}`,
    });
  }
  done(back, ctx.isAdmin ? "Vraag toegevoegd." : "Je vraag staat erin. Sabine krijgt er een melding van.");
}

export async function answerQuestion(formData: FormData) {
  const ctx = await requireCoupleAdmin(str(formData, "coupleId", 40));
  const id = str(formData, "questionId", 40);
  const answer = str(formData, "answer", 6000);
  const back = portal(ctx.couple.id, "#vragenblok");
  if (!isUuid(id)) done(back, "Vraag niet gevonden.", true);
  if (!answer) done(back, "Typ eerst een antwoord. Een vraag gaat pas naar de geschiedenis als hij beantwoord is.", true);
  const q = await one<{ body: string }>(
    `update questions set answer = $3, answered_by = $4, answered_at = now()
      where id = $1 and couple_id = $2 returning body`,
    [id, ctx.couple.id, answer, ctx.account.id],
  );
  if (!q) done(back, "Vraag niet gevonden.", true);
  // Both partners, also when one of them has no account yet. The answer itself is not in the mail.
  const recipients = [
    ...new Set(
      [...(await coupleMembers(ctx.couple.id)).map((a) => a.email), ctx.couple.partner1_email, ctx.couple.partner2_email]
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const sent = await sendMail({
    to: recipients,
    replyTo: ctx.account.email,
    subject: "Er staat een antwoord voor jullie klaar",
    log: { kind: "antwoord", coupleId: ctx.couple.id, sentBy: ctx.account.name },
    text: `Hoi ${coupleName(ctx.couple)},\n\nSabine heeft jullie vraag in Your Wedding Space beantwoord. Log in om het antwoord te lezen:\n${appUrl()}${portal(ctx.couple.id, "#vragenblok")}`,
  });
  done(back, sent ? "Antwoord opgeslagen. Het bruidspaar krijgt een melding per e-mail." : "Antwoord opgeslagen. (Er is geen e-mail verstuurd: het versturen van e-mail staat niet ingesteld of mislukte.)");
}

/** The couple opened an answer: from now on it is in the history. Sabine opening it changes nothing. */
export async function markQuestionRead(coupleId: string, questionId: string): Promise<void> {
  const ctx = await requireCouple(coupleId);
  if (ctx.isAdmin || !isUuid(questionId)) return;
  await query(
    "update questions set read_at = now(), read_by = $3 where id = $1 and couple_id = $2 and answered_at is not null and read_at is null",
    [questionId, ctx.couple.id, ctx.account.id],
  );
}

// Appointments and deadlines ---------------------------------------------------------------

export async function addAppointment(formData: FormData) {
  const ctx = await ctxFrom(formData);
  const back = portal(ctx.couple.id, "/afspraken");
  const title = str(formData, "title", 200);
  const onDate = dateField(formData, "onDate");
  const kind = str(formData, "kind") === "deadline" ? "deadline" : "appointment";
  if (!title || !onDate) done(back, "Vul een omschrijving en een datum in.", true);
  const atTime = /^\d{2}:\d{2}$/.test(str(formData, "atTime", 5)) ? str(formData, "atTime", 5) : "";
  // Only Sabine can put something in her own agenda.
  const withSabine = ctx.isAdmin && formData.get("withSabine") === "on";
  await query(
    `insert into appointments (couple_id, kind, title, on_date, at_time, with_sabine, notes, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [ctx.couple.id, kind, title, onDate, atTime, withSabine, str(formData, "notes", 2000), ctx.account.id],
  );
  await note(ctx, `${kind === "deadline" ? "Deadline" : "Afspraak"} toegevoegd: ${title} (${formatDate(onDate)})`);
  done(back, kind === "deadline" ? "Deadline toegevoegd." : "Afspraak toegevoegd.");
}

export async function deleteAppointment(formData: FormData) {
  const ctx = await ctxFrom(formData);
  const id = str(formData, "appointmentId", 40);
  if (isUuid(id)) await query("delete from appointments where id = $1 and couple_id = $2", [id, ctx.couple.id]);
  done(portal(ctx.couple.id, "/afspraken"), "Verwijderd.");
}

// Meetings ("Jullie Pakket"), Sabine only ---------------------------------------------------

export async function saveMeeting(formData: FormData) {
  const ctx = await requireCoupleAdmin(str(formData, "coupleId", 40));
  const id = str(formData, "meetingId", 40);
  const back = portal(ctx.couple.id, `/pakket#m-${id}`);
  if (!isUuid(id)) done(back, "Meeting niet gevonden.", true);
  const status = ["to_plan", "planned", "done", "skipped"].includes(str(formData, "status")) ? str(formData, "status") : "to_plan";
  const previous = await one<{ summary_file_id: string | null }>("select summary_file_id from meetings where id = $1 and couple_id = $2", [id, ctx.couple.id]);
  let replaced = false;
  try {
    await tx(async (db) => {
      const file = await storeUpload(formData.get("summaryFile"), { coupleId: ctx.couple.id, accountId: ctx.account.id }, db);
      replaced = Boolean(file) || formData.get("removeFile") === "on";
      const updated = await one(
        `update meetings set title = coalesce(nullif($3, ''), title), guide = $4, planned_on = $5, summary = $6, status = $7,
                summary_file_id = case when $8 then null when $9::uuid is not null then $9::uuid else summary_file_id end
          where id = $1 and couple_id = $2 returning id`,
        [id, ctx.couple.id, str(formData, "title", 120), str(formData, "guide", 3000), dateField(formData, "plannedOn"),
         str(formData, "summary", 20_000), status, formData.get("removeFile") === "on", file?.id ?? null],
        db,
      );
      if (!updated) throw new UploadError("Meeting niet gevonden.");
    });
  } catch (err) {
    if (err instanceof UploadError) done(back, err.message, true);
    throw err;
  }
  // The old summary file is not linked to anything any more.
  if (replaced && previous?.summary_file_id) {
    await deleteFiles("delete from files where id = $1 and couple_id = $2", [previous.summary_file_id, ctx.couple.id]);
  }
  done(back, "Meeting opgeslagen.");
}

export async function addMeeting(formData: FormData) {
  const ctx = await requireCoupleAdmin(str(formData, "coupleId", 40));
  const kind = str(formData, "kind") === "evaluation" ? "evaluation" : "meeting";
  const back = portal(ctx.couple.id, "/pakket");
  await tx(async (db) => {
    if (kind === "evaluation") {
      const exists = await one("select 1 from meetings where couple_id = $1 and kind = 'evaluation'", [ctx.couple.id], db);
      if (exists) return;
      const guide = await one<{ evaluation_guide: string }>("select evaluation_guide from settings", [], db);
      await query(
        `insert into meetings (couple_id, kind, title, guide, status, position)
         values ($1, 'evaluation', 'Evaluatie', $2, 'to_plan', (select coalesce(max(position), 0) + 1 from meetings where couple_id = $1))`,
        [ctx.couple.id, guide?.evaluation_guide ?? ""],
        db,
      );
    } else {
      // A new numbered meeting goes before the detail meeting and the evaluation.
      const count = await one<{ n: number }>("select count(*)::int as n from meetings where couple_id = $1 and kind = 'meeting'", [ctx.couple.id], db);
      const n = (count?.n ?? 0) + 1;
      await query("update meetings set position = position + 1 where couple_id = $1 and position >= $2", [ctx.couple.id, n], db);
      await query(
        "insert into meetings (couple_id, kind, title, status, position) values ($1, 'meeting', $2, 'to_plan', $3)",
        [ctx.couple.id, `Meeting ${n}`, n],
        db,
      );
    }
  });
  done(back, kind === "evaluation" ? "Evaluatie toegevoegd." : "Meeting toegevoegd.");
}

export async function deleteMeeting(formData: FormData) {
  const ctx = await requireCoupleAdmin(str(formData, "coupleId", 40));
  const id = str(formData, "meetingId", 40);
  if (isUuid(id)) await query("delete from meetings where id = $1 and couple_id = $2", [id, ctx.couple.id]);
  done(portal(ctx.couple.id, "/pakket"), "Verwijderd.");
}

// Suppliers: see ws-suppliers.ts.

// Budget and costs: see ws-costs.ts.
