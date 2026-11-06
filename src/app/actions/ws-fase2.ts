"use server";

import { randomBytes } from "crypto";
import { after } from "next/server";
import { requireOwner } from "@/lib/auth/session";
import { requireCouple, requireCoupleAdmin, type CoupleContext } from "@/lib/ws/access";
import { aiConfigured, draftStylingPlan, extractColors, summariseAssignment } from "@/lib/ws/ai";
import { copyAssignmentTemplate, logActivity } from "@/lib/ws/couples";
import { isUuid, one, query, tx } from "@/lib/ws/db";
import { deleteFiles, storeUpload, storeUploads, UploadError } from "@/lib/ws/files";
import { coupleName } from "@/lib/ws/format";
import { adminNotifyEmail, appUrl, sendMail } from "@/lib/ws/mail";
import { dateField, done, str } from "@/lib/ws/redirect";

const portal = (coupleId: string, sub = "") => `/k/${coupleId}${sub}`;
const ctxFrom = (formData: FormData) => requireCouple(str(formData, "coupleId", 40));
const adminFrom = (formData: FormData) => requireCoupleAdmin(str(formData, "coupleId", 40));
const id = (formData: FormData, name: string) => {
  const value = str(formData, name, 40);
  return isUuid(value) ? value : null;
};
async function note(ctx: CoupleContext, action: string) {
  if (!ctx.isAdmin) await logActivity(ctx.couple.id, ctx.account.id, action);
}
const intOrNull = (formData: FormData, name: string) => {
  const raw = str(formData, name, 6);
  if (raw === "") return null;
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n >= 0 && n <= 5000 ? n : null;
};

// Draaiboek ---------------------------------------------------------------------------------

export async function saveGuestCounts(formData: FormData) {
  const ctx = await ctxFrom(formData);
  await query("update couples set guests_day = $2, guests_day_kids = $3, guests_evening = $4 where id = $1", [
    ctx.couple.id, intOrNull(formData, "guestsDay"), intOrNull(formData, "guestsDayKids"), intOrNull(formData, "guestsEvening"),
  ]);
  await note(ctx, "Aantal gasten in het draaiboek bijgewerkt");
  done(portal(ctx.couple.id, "/draaiboek"), "Aantal gasten opgeslagen.");
}

const ROW_FIELDS = ["atTime", "who", "what", "info", "location", "rainLocation"] as const;
const ROW_MAX = { atTime: 20, who: 300, what: 500, info: 2000, location: 300, rainLocation: 300 } as const;

/**
 * One form per tab: every button saves all rows first, so adding or deleting
 * a row never throws away edits elsewhere (same idea as the lesson editor).
 */
export async function saveRunsheet(formData: FormData) {
  const ctx = await ctxFrom(formData);
  const tabId = id(formData, "tabId");
  const back = portal(ctx.couple.id, `/draaiboek?tab=${tabId}`);
  if (!tabId || !(await one("select 1 from runsheet_tabs where id = $1 and couple_id = $2", [tabId, ctx.couple.id]))) done(portal(ctx.couple.id, "/draaiboek"), "Tabblad niet gevonden.", true);
  const rows = await query<{ id: string }>("select id from runsheet_rows where tab_id = $1", [tabId]);
  const [action, arg] = str(formData, "intent", 60).split(":");
  let message = "Draaiboek opgeslagen.";
  await tx(async (db) => {
    for (const row of rows) {
      if (!formData.has(`r-${row.id}-what`)) continue;
      const values = ROW_FIELDS.map((f) => str(formData, `r-${row.id}-${f}`, ROW_MAX[f]));
      await query(
        "update runsheet_rows set at_time = $2, who = $3, what = $4, info = $5, location = $6, rain_location = $7 where id = $1",
        [row.id, ...values],
        db,
      );
    }
    const fresh = ROW_FIELDS.map((f) => str(formData, `new-${f}`, ROW_MAX[f]));
    if (fresh.some(Boolean)) {
      await query(
        `insert into runsheet_rows (couple_id, tab_id, at_time, who, what, info, location, rain_location, position)
         values ($1, $2, $3, $4, $5, $6, $7, $8, (select coalesce(max(position), 0) + 1 from runsheet_rows where tab_id = $2))`,
        [ctx.couple.id, tabId, ...fresh],
        db,
      );
      message = "Draaiboek opgeslagen, regel toegevoegd.";
    }
    if (action === "delete" && isUuid(arg)) {
      await query("delete from runsheet_rows where id = $1 and tab_id = $2", [arg, tabId], db);
      message = "Draaiboek opgeslagen, regel verwijderd.";
    }
  });
  await note(ctx, "Draaiboek bijgewerkt");
  done(back, message);
}

export async function saveRunsheetTab(formData: FormData) {
  const ctx = await adminFrom(formData);
  const tabId = id(formData, "tabId");
  const title = str(formData, "title", 80);
  const back = portal(ctx.couple.id, "/draaiboek");
  if (formData.get("intent") === "delete" && tabId) {
    await query("delete from runsheet_tabs where id = $1 and couple_id = $2", [tabId, ctx.couple.id]);
    done(back, "Tabblad verwijderd.");
  }
  if (!title) done(back, "Geef het tabblad een naam.", true);
  const kind = str(formData, "kind") === "schedule" ? "schedule" : "list";
  if (tabId) {
    await query("update runsheet_tabs set title = $3 where id = $1 and couple_id = $2", [tabId, ctx.couple.id, title]);
    done(`${back}?tab=${tabId}`, "Tabblad hernoemd.");
  }
  const tab = await one<{ id: string }>(
    "insert into runsheet_tabs (couple_id, title, kind, position) values ($1, $2, $3, (select coalesce(max(position), 0) + 1 from runsheet_tabs where couple_id = $1)) returning id",
    [ctx.couple.id, title, kind],
  );
  done(`${back}?tab=${tab!.id}`, "Tabblad toegevoegd.");
}

// RSVP forms (Sabine) ----------------------------------------------------------------------------

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function saveRsvpForm(formData: FormData) {
  const ctx = await adminFrom(formData);
  const formId = id(formData, "formId");
  const back = portal(ctx.couple.id, "/gasten/formulieren");
  if (formData.get("intent") === "delete" && formId) {
    await query("delete from rsvp_forms where id = $1 and couple_id = $2", [formId, ctx.couple.id]);
    done(back, "Formulier verwijderd. Aanmeldingen blijven in de gastenlijst.");
  }
  const name = str(formData, "name", 80);
  if (!name) done(back, "Geef het formulier een naam, bijvoorbeeld Daggasten.", true);
  const color = HEX.test(str(formData, "qrColor", 7)) ? str(formData, "qrColor", 7) : "#2c2c2c";
  const background = HEX.test(str(formData, "qrBackground", 7)) ? str(formData, "qrBackground", 7) : "#ffffff";
  const values = [
    name, str(formData, "intro", 3000), formData.get("askPartOfDay") === "on", formData.get("askDiet") === "on",
    str(formData, "dresscode", 300), str(formData, "confirmationText", 5000), str(formData, "declineText", 5000),
    color, background, formData.get("open") === "on",
  ];
  if (formId) {
    await query(
      `update rsvp_forms set name = $3, intro = $4, ask_part_of_day = $5, ask_diet = $6, dresscode = $7, confirmation_text = $8,
              decline_text = $9, qr_color = $10, qr_background = $11, open = $12 where id = $1 and couple_id = $2`,
      [formId, ctx.couple.id, ...values],
    );
    done(`${back}#f-${formId}`, "Formulier opgeslagen.");
  }
  const slug = randomBytes(9).toString("base64url");
  const form = await one<{ id: string }>(
    `insert into rsvp_forms (couple_id, slug, name, intro, ask_part_of_day, ask_diet, dresscode, confirmation_text, decline_text, qr_color, qr_background, open, position)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, (select coalesce(max(position), 0) + 1 from rsvp_forms where couple_id = $1)) returning id`,
    [ctx.couple.id, slug, ...values],
  );
  done(`${back}#f-${form!.id}`, "Formulier aangemaakt. Deel de link of de QR-code.");
}

export async function saveRsvpQuestion(formData: FormData) {
  const ctx = await adminFrom(formData);
  const formId = id(formData, "formId");
  const back = portal(ctx.couple.id, `/gasten/formulieren#f-${formId}`);
  if (!formId || !(await one("select 1 from rsvp_forms where id = $1 and couple_id = $2", [formId, ctx.couple.id]))) done(back, "Formulier niet gevonden.", true);
  const questionId = id(formData, "questionId");
  if (questionId) {
    await query("delete from rsvp_questions where id = $1 and form_id = $2", [questionId, formId]);
    done(back, "Vraag verwijderd.");
  }
  const label = str(formData, "label", 300);
  if (!label) done(back, "Vul de vraag in.", true);
  await query(
    "insert into rsvp_questions (form_id, label, kind, position) values ($1, $2, $3, (select coalesce(max(position), 0) + 1 from rsvp_questions where form_id = $1))",
    [formId, label, str(formData, "kind") === "yesno" ? "yesno" : "text"],
  );
  done(back, "Vraag toegevoegd.");
}

// Guest list (both) -------------------------------------------------------------------------------

function guestFields(formData: FormData) {
  const attendance = ["yes", "no", "partial"].includes(str(formData, "attendance")) ? str(formData, "attendance") : "yes";
  return [
    str(formData, "firstName", 80), str(formData, "lastName", 80), str(formData, "relation", 120), str(formData, "email", 200),
    str(formData, "phone", 40), str(formData, "diet", 500), attendance, str(formData, "partialNote", 300),
    formData.get("isKid") === "on", str(formData, "notes", 1000),
  ];
}

export async function saveGuest(formData: FormData) {
  const ctx = await ctxFrom(formData);
  const guestId = id(formData, "guestId");
  const back = portal(ctx.couple.id, "/gasten");
  if (formData.get("intent") === "delete" && guestId) {
    await query("delete from guests where id = $1 and couple_id = $2", [guestId, ctx.couple.id]);
    await note(ctx, "Gast verwijderd");
    done(back, "Gast verwijderd.");
  }
  const fields = guestFields(formData);
  if (!fields[0]) done(back, "Vul minstens een voornaam in.", true);
  if (guestId) {
    await query(
      `update guests set first_name = $3, last_name = $4, relation = $5, email = $6, phone = $7, diet = $8, attendance = $9,
              partial_note = $10, is_kid = $11, notes = $12 where id = $1 and couple_id = $2`,
      [guestId, ctx.couple.id, ...fields],
    );
  } else {
    await query(
      `insert into guests (couple_id, first_name, last_name, relation, email, phone, diet, attendance, partial_note, is_kid, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [ctx.couple.id, ...fields],
    );
  }
  await note(ctx, "Gastenlijst bijgewerkt");
  done(back, "Gast opgeslagen.");
}

// Assignments -----------------------------------------------------------------------------------------

async function loadQA(assignmentId: string) {
  return query<{ prompt: string; answer: string }>("select prompt, answer from assignment_questions where assignment_id = $1 order by position", [assignmentId]);
}

/** Runs after the response has been sent: the couple does not wait for the AI. */
async function summariseLater(assignmentId: string) {
  if (!aiConfigured()) return;
  try {
    const a = await one<{ title: string }>("select title from assignments where id = $1", [assignmentId]);
    if (!a) return;
    const summary = await summariseAssignment(a.title, await loadQA(assignmentId));
    await query("update assignments set ai_summary = $2, ai_summary_at = now(), ai_error = '' where id = $1", [assignmentId, summary]);
  } catch (err) {
    console.error(`[ai] samenvatting ${assignmentId}: ${(err as Error).message}`);
    await query("update assignments set ai_error = $2 where id = $1", [assignmentId, (err as Error).message.slice(0, 300)]);
  }
}

export async function saveAnswers(formData: FormData) {
  const ctx = await ctxFrom(formData);
  const assignmentId = id(formData, "assignmentId");
  const back = portal(ctx.couple.id, `/opdrachten/${assignmentId}`);
  const assignment = assignmentId
    ? await one<{ id: string; title: string; submitted_at: Date | null; visible_from: string | null }>(
        "select id, title, submitted_at, visible_from from assignments where id = $1 and couple_id = $2",
        [assignmentId, ctx.couple.id],
      )
    : null;
  if (!assignment) done(portal(ctx.couple.id, "/opdrachten"), "Opdracht niet gevonden.", true);
  const questions = await query<{ id: string }>("select id from assignment_questions where assignment_id = $1", [assignment.id]);
  await tx(async (db) => {
    for (const q of questions) {
      if (formData.has(`a-${q.id}`)) {
        await query("update assignment_questions set answer = $2 where id = $1", [q.id, str(formData, `a-${q.id}`, 20_000)], db);
      }
    }
  });
  const submit = formData.get("intent") === "submit";
  if (submit) {
    await query("update assignments set submitted_at = coalesce(submitted_at, now()), ai_error = '' where id = $1", [assignment.id]);
    after(() => summariseLater(assignment.id));
    if (!ctx.isAdmin) {
      await logActivity(ctx.couple.id, ctx.account.id, `Opdracht ingestuurd: ${assignment.title}`);
      await sendMail({
        to: adminNotifyEmail(),
        replyTo: ctx.account.email,
        subject: `${coupleName(ctx.couple)} heeft "${assignment.title}" ingevuld`,
        text: `${ctx.account.name} heeft de opdracht "${assignment.title}" ingestuurd.\n\nBekijken: ${appUrl()}${back}`,
      });
    }
    done(back, aiConfigured() ? "Ingestuurd. De samenvatting staat hier over een minuutje." : "Ingestuurd. Sabine krijgt er een melding van.");
  }
  await note(ctx, `Opdracht bijgewerkt: ${assignment.title}`);
  done(back, "Antwoorden opgeslagen.");
}

export async function manageAssignment(formData: FormData) {
  const ctx = await adminFrom(formData);
  const assignmentId = id(formData, "assignmentId");
  const intent = str(formData, "intent");
  const list = portal(ctx.couple.id, "/opdrachten");
  if (intent === "fromTemplate") {
    const templateId = id(formData, "templateId");
    const created = templateId ? await copyAssignmentTemplate(ctx.couple.id, templateId) : null;
    if (!created) done(list, "Kies een opdracht.", true);
    done(portal(ctx.couple.id, `/opdrachten/${created}`), "Opdracht toegevoegd.");
  }
  if (intent === "blank") {
    const a = await one<{ id: string }>(
      "insert into assignments (couple_id, title, position) values ($1, 'Nieuwe opdracht', (select coalesce(max(position), 0) + 1 from assignments where couple_id = $1)) returning id",
      [ctx.couple.id],
    );
    done(portal(ctx.couple.id, `/opdrachten/${a!.id}`), "Opdracht aangemaakt. Geef hem een titel en vragen.");
  }
  if (!assignmentId || !(await one("select 1 from assignments where id = $1 and couple_id = $2", [assignmentId, ctx.couple.id]))) done(list, "Opdracht niet gevonden.", true);
  const back = portal(ctx.couple.id, `/opdrachten/${assignmentId}`);
  switch (intent) {
    case "save":
      await query("update assignments set title = coalesce(nullif($2, ''), title), intro = $3, visible_from = $4, styling_source = $5 where id = $1", [
        assignmentId, str(formData, "title", 200), str(formData, "intro", 5000), dateField(formData, "visibleFrom"), formData.get("stylingSource") === "on",
      ]);
      done(back, "Opdracht opgeslagen.");
    case "addQuestion": {
      const prompt = str(formData, "prompt", 1000);
      if (!prompt) done(back, "Vul de vraag in.", true);
      await query(
        "insert into assignment_questions (assignment_id, prompt, help, position) values ($1, $2, $3, (select coalesce(max(position), 0) + 1 from assignment_questions where assignment_id = $1))",
        [assignmentId, prompt, str(formData, "help", 1000)],
      );
      done(back, "Vraag toegevoegd.");
    }
    case "deleteQuestion": {
      const questionId = id(formData, "questionId");
      if (questionId) await query("delete from assignment_questions where id = $1 and assignment_id = $2", [questionId, assignmentId]);
      done(back, "Vraag verwijderd.");
    }
    case "reopen":
      await query("update assignments set submitted_at = null where id = $1", [assignmentId]);
      done(back, "De opdracht staat weer open voor het bruidspaar.");
    case "summarise":
      if (!aiConfigured()) done(back, "AI staat niet aan (ANTHROPIC_API_KEY ontbreekt).", true);
      await summariseLater(assignmentId);
      done(back, "Samenvatting opnieuw gemaakt.");
    case "saveSummary":
      await query("update assignments set ai_summary = $2, ai_summary_at = now() where id = $1", [assignmentId, str(formData, "summary", 20_000)]);
      done(back, "Samenvatting opgeslagen.");
    case "delete":
      await query("delete from assignments where id = $1", [assignmentId]);
      done(list, "Opdracht verwijderd.");
  }
  done(back, "Onbekende actie.", true);
}

// Styling plan -----------------------------------------------------------------------------------------

export async function saveStylingPlan(formData: FormData) {
  const ctx = await adminFrom(formData);
  const back = portal(ctx.couple.id, "/styling");
  const intent = str(formData, "intent");
  if (intent === "draft") {
    if (!aiConfigured()) done(back, "AI staat niet aan (ANTHROPIC_API_KEY ontbreekt).", true);
    const sources = await query<{ id: string; title: string }>(
      "select id, title from assignments where couple_id = $1 and styling_source order by position",
      [ctx.couple.id],
    );
    const filled = [];
    for (const s of sources) {
      const items = await loadQA(s.id);
      if (items.some((i) => i.answer.trim())) filled.push({ title: s.title, items });
    }
    if (filled.length === 0) done(back, "Er zijn nog geen antwoorden op de opdracht Thema & Moodboard om een concept van te maken.", true);
    try {
      const draft = await draftStylingPlan(filled);
      await query(
        `insert into styling_plans (couple_id, ai_draft, ai_draft_at, colors, ai_error) values ($1, $2, now(), $3::jsonb, '')
         on conflict (couple_id) do update set ai_draft = excluded.ai_draft, ai_draft_at = now(), ai_error = '',
           colors = case when jsonb_array_length(styling_plans.colors) = 0 then excluded.colors else styling_plans.colors end`,
        [ctx.couple.id, draft, JSON.stringify(extractColors(draft))],
      );
    } catch (err) {
      done(back, `Concept maken is niet gelukt: ${(err as Error).message}`, true);
    }
    done(back, "Concept gemaakt. Neem over wat je wilt en verfijn het.");
  }
  const colors = [...str(formData, "colors", 500).matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => m[0].toLowerCase()).slice(0, 10);
  await query(
    `insert into styling_plans (couple_id, concept, colors, published, updated_at) values ($1, $2, $3::jsonb, $4, now())
     on conflict (couple_id) do update set concept = excluded.concept, colors = excluded.colors, published = excluded.published, updated_at = now()`,
    [ctx.couple.id, str(formData, "concept", 20_000), JSON.stringify(colors), formData.get("published") === "on"],
  );
  done(back, formData.get("published") === "on" ? "Stylingplan opgeslagen en zichtbaar voor het bruidspaar." : "Stylingplan opgeslagen (nog niet zichtbaar voor het bruidspaar).");
}

export async function stylingImage(formData: FormData) {
  const ctx = await ctxFrom(formData);
  const back = portal(ctx.couple.id, "/styling");
  const imageId = id(formData, "imageId");
  if (imageId) {
    await deleteFiles(
      "delete from files where id = (select file_id from styling_images where id = $1 and couple_id = $2)",
      [imageId, ctx.couple.id],
    );
    done(back, "Afbeelding verwijderd.");
  }
  let count = 0;
  try {
    // Several photos at once; the caption goes with each of them.
    const files = await storeUploads(formData.getAll("image"), { coupleId: ctx.couple.id, accountId: ctx.account.id, images: true });
    if (files.length === 0) done(back, "Kies eerst een afbeelding.", true);
    for (const file of files) {
      await query("insert into styling_images (couple_id, file_id, caption) values ($1, $2, $3)", [ctx.couple.id, file.id, str(formData, "caption", 200)]);
    }
    count = files.length;
  } catch (err) {
    if (err instanceof UploadError) done(back, err.message, true);
    throw err;
  }
  await note(ctx, count === 1 ? "Afbeelding aan het moodboard toegevoegd" : `${count} afbeeldingen aan het moodboard toegevoegd`);
  done(back, count === 1 ? "Afbeelding toegevoegd aan het moodboard." : `${count} afbeeldingen toegevoegd aan het moodboard.`);
}

// Sabine's templates and photo -------------------------------------------------------------------------

export async function manageTemplate(formData: FormData) {
  await requireOwner();
  const templateId = id(formData, "templateId");
  const intent = str(formData, "intent");
  const list = "/beheer/bruidsparen/opdrachten";
  if (intent === "create") {
    const t = await one<{ id: string }>(
      "insert into assignment_templates (title, position) values ($1, (select coalesce(max(position), 0) + 1 from assignment_templates)) returning id",
      [str(formData, "title", 200) || "Nieuwe opdracht"],
    );
    done(`${list}#t-${t!.id}`, "Opdracht aangemaakt. Voeg vragen toe.");
  }
  if (!templateId) done(list, "Opdracht niet gevonden.", true);
  const back = `${list}#t-${templateId}`;
  switch (intent) {
    case "save":
      await query("update assignment_templates set title = coalesce(nullif($2, ''), title), intro = $3, styling_source = $4 where id = $1", [
        templateId, str(formData, "title", 200), str(formData, "intro", 5000), formData.get("stylingSource") === "on",
      ]);
      done(back, "Opdracht opgeslagen. Geldt voor nieuwe bruidsparen.");
    case "archive":
      await query("update assignment_templates set archived = not archived where id = $1", [templateId]);
      done(back, "Bijgewerkt.");
    case "addQuestion": {
      const prompt = str(formData, "prompt", 1000);
      if (!prompt) done(back, "Vul de vraag in.", true);
      await query(
        "insert into assignment_template_questions (template_id, prompt, help, position) values ($1, $2, $3, (select coalesce(max(position), 0) + 1 from assignment_template_questions where template_id = $1))",
        [templateId, prompt, str(formData, "help", 1000)],
      );
      done(back, "Vraag toegevoegd.");
    }
    case "deleteQuestion": {
      const questionId = id(formData, "questionId");
      if (questionId) await query("delete from assignment_template_questions where id = $1 and template_id = $2", [questionId, templateId]);
      done(back, "Vraag verwijderd.");
    }
  }
  done(list, "Onbekende actie.", true);
}

export async function uploadContactPhoto(formData: FormData) {
  const owner = await requireOwner();
  const back = "/beheer/bruidsparen/instellingen";
  const current = await one<{ contact_photo_file_id: string | null }>("select contact_photo_file_id from settings");
  if (formData.get("remove") === "on") {
    await query("update settings set contact_photo_file_id = null");
    if (current?.contact_photo_file_id) await deleteFiles("delete from files where id = $1 and couple_id is null", [current.contact_photo_file_id]);
    done(back, "Pasfoto verwijderd.");
  }
  try {
    const file = await storeUpload(formData.get("photo"), { coupleId: null, accountId: owner.id, images: true });
    if (!file) done(back, "Kies eerst een foto.", true);
    await query("update settings set contact_photo_file_id = $1", [file.id]);
    if (current?.contact_photo_file_id) await deleteFiles("delete from files where id = $1 and couple_id is null", [current.contact_photo_file_id]);
  } catch (err) {
    if (err instanceof UploadError) done(back, err.message, true);
    throw err;
  }
  done(back, "Pasfoto opgeslagen. Hij staat nu in de contactkaart van elk bruidspaar.");
}
