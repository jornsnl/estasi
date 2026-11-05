"use server";

import { isUuid, one, query, tx } from "@/lib/db";
import { requireCouple, requireCoupleAdmin, type CoupleContext } from "@/lib/auth/access";
import { coupleAccounts, logActivity } from "@/lib/data/couples";
import { storeUpload, UploadError } from "@/lib/data/files";
import { coupleName, formatDate, LANES, parseMoney } from "@/lib/domain/format";
import { adminNotifyEmail, appUrl, sendMail } from "@/lib/mail";
import { dateField, done, str } from "@/lib/redirect";
import type { Lane } from "@/lib/types";

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
                      done_by = case when done_at is null then $3::uuid else null end
      where id = $1 and couple_id = $2 returning title, done_at`,
    [id, ctx.couple.id, ctx.account.id],
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
  await query("insert into questions (couple_id, body, asked_by) values ($1, $2, $3)", [ctx.couple.id, body, ctx.account.id]);
  await note(ctx, "Nieuwe vraag gesteld");
  if (!ctx.isAdmin) {
    await sendMail({
      to: adminNotifyEmail(),
      replyTo: ctx.account.email,
      subject: `Nieuwe vraag van ${coupleName(ctx.couple)}`,
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
  const recipients = (await coupleAccounts(ctx.couple.id)).map((a) => a.email);
  const sent = await sendMail({
    to: recipients,
    replyTo: ctx.account.email,
    subject: "Sabine heeft jullie vraag beantwoord",
    text: `Jullie vroegen:\n${q.body}\n\nAntwoord van Sabine:\n${answer}\n\nTerugkijken kan altijd onder Vragenblok, Geschiedenis: ${appUrl()}${portal(ctx.couple.id, "/geschiedenis?soort=vragen")}`,
  });
  done(back, sent ? "Antwoord opgeslagen en gemaild naar het bruidspaar." : "Antwoord opgeslagen. (Er is geen e-mail verstuurd: SMTP staat niet ingesteld.)");
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
  try {
    await tx(async (db) => {
      const file = await storeUpload(formData.get("summaryFile"), { coupleId: ctx.couple.id, accountId: ctx.account.id }, db);
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

// Suppliers -----------------------------------------------------------------------------------

/**
 * Sabine fills in the supplier itself; the couple may only add notes and
 * documents (decision in h9.13 of the document).
 */
export async function saveSupplier(formData: FormData) {
  const ctx = await ctxFrom(formData);
  const categoryId = str(formData, "categoryId", 40);
  const back = portal(ctx.couple.id, `/leveranciers/${categoryId}`);
  if (!ctx.couple.suppliers_enabled || !isUuid(categoryId)) done(portal(ctx.couple.id, "/leveranciers"), "Niet gevonden.", true);
  const category = await one("select 1 from supplier_categories where id = $1 and not archived", [categoryId]);
  if (!category) done(portal(ctx.couple.id, "/leveranciers"), "Niet gevonden.", true);

  try {
    await tx(async (db) => {
      const row = await one<{ id: string }>(
        `insert into couple_suppliers (couple_id, category_id) values ($1, $2)
         on conflict (couple_id, category_id) do update set updated_at = now() returning id`,
        [ctx.couple.id, categoryId],
        db,
      );
      if (ctx.isAdmin) {
        const status = ["open", "talking", "booked"].includes(str(formData, "status")) ? str(formData, "status") : "open";
        await query(
          `update couple_suppliers set status = $2, name = $3, contact_person = $4, phone = $5, email = $6, website = $7, address = $8, notes = $9
            where id = $1`,
          [row!.id, status, str(formData, "name", 200), str(formData, "contactPerson", 200), str(formData, "phone", 60),
           str(formData, "email", 200), str(formData, "website", 300), str(formData, "address", 300), str(formData, "notes", 5000)],
          db,
        );
      } else {
        await query("update couple_suppliers set notes = $2 where id = $1", [row!.id, str(formData, "notes", 5000)], db);
      }
      const file = await storeUpload(formData.get("document"), { coupleId: ctx.couple.id, accountId: ctx.account.id }, db);
      if (file) await query("insert into supplier_documents (supplier_id, file_id) values ($1, $2)", [row!.id, file.id], db);
    });
  } catch (err) {
    if (err instanceof UploadError) done(back, err.message, true);
    throw err;
  }
  await note(ctx, "Leverancier bijgewerkt");
  done(back, "Opgeslagen.");
}

export async function deleteSupplierDocument(formData: FormData) {
  const ctx = await ctxFrom(formData);
  const id = str(formData, "documentId", 40);
  const categoryId = str(formData, "categoryId", 40);
  if (isUuid(id)) {
    // The file goes with it; the join makes sure it belongs to this couple.
    await query(
      `delete from files where id = (select d.file_id from supplier_documents d join couple_suppliers s on s.id = d.supplier_id
                                      where d.id = $1 and s.couple_id = $2)`,
      [id, ctx.couple.id],
    );
  }
  done(portal(ctx.couple.id, `/leveranciers/${categoryId}`), "Document verwijderd.");
}

// Budget -----------------------------------------------------------------------------------------

function moneyField(formData: FormData, name: string, back: string): number | null {
  try {
    return parseMoney(str(formData, name, 30));
  } catch (err) {
    done(back, (err as Error).message, true);
  }
}

export async function saveBudgetItem(formData: FormData) {
  const ctx = await ctxFrom(formData);
  const back = portal(ctx.couple.id, "/kosten");
  const id = str(formData, "itemId", 40);
  const name = str(formData, "name", 200);
  if (!name) done(back, "Geef de kostenpost een naam.", true);
  const values = [
    name,
    str(formData, "category", 100),
    moneyField(formData, "budget", back) ?? 0,
    moneyField(formData, "actual", back),
    moneyField(formData, "deposit", back),
    dateField(formData, "depositDue"),
    dateField(formData, "paymentDue"),
    formData.get("paid") === "on",
  ];
  if (isUuid(id)) {
    await query(
      `update budget_items set name = $3, category = $4, budget_cents = $5, actual_cents = $6, deposit_cents = $7,
              deposit_due = $8, payment_due = $9, paid = $10 where id = $1 and couple_id = $2`,
      [id, ctx.couple.id, ...values],
    );
  } else {
    await query(
      `insert into budget_items (couple_id, name, category, budget_cents, actual_cents, deposit_cents, deposit_due, payment_due, paid, position)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce((select max(position) + 1 from budget_items where couple_id = $1), 1))`,
      [ctx.couple.id, ...values],
    );
  }
  await note(ctx, `Kostenpost bijgewerkt: ${name}`);
  done(back, "Kostenpost opgeslagen.");
}

export async function deleteBudgetItem(formData: FormData) {
  const ctx = await ctxFrom(formData);
  const id = str(formData, "itemId", 40);
  if (isUuid(id)) await query("delete from budget_items where id = $1 and couple_id = $2", [id, ctx.couple.id]);
  done(portal(ctx.couple.id, "/kosten"), "Kostenpost verwijderd.");
}
