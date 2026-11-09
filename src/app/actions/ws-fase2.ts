"use server";

import { after } from "next/server";
import { requireOwner } from "@/lib/auth/session";
import { requireCouple, requireCoupleAdmin, type CoupleContext } from "@/lib/ws/access";
import { aiConfigured, draftStylingPlan, extractColors, summariseAssignment } from "@/lib/ws/ai";
import { readBudgetForm } from "@/lib/ws/budget";
import { readPalette, writePalette } from "@/lib/ws/color";
import { copyAssignmentTemplate, logActivity } from "@/lib/ws/couples";
import { isUuid, one, query, tx } from "@/lib/ws/db";
import { deleteFiles, storeUpload, storeUploads, UploadError } from "@/lib/ws/files";
import { coupleName } from "@/lib/ws/format";
import { sabineAddress, appUrl, sendMail } from "@/lib/ws/mail";
import { claudeSummaryHint } from "@/lib/ws/summaries";
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

// Rows and tabs: see ws-runsheet.ts.

// RSVP forms (Sabine) ----------------------------------------------------------------------------

// RSVP forms and the guest list: see ws-rsvp.ts.

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
    ? await one<{ id: string; title: string; submitted_at: Date | null; visible_from: string | null; budget: boolean; styling_source: boolean }>(
        "select id, title, submitted_at, visible_from, budget, styling_source from assignments where id = $1 and couple_id = $2",
        [assignmentId, ctx.couple.id],
      )
    : null;
  if (!assignment) done(portal(ctx.couple.id, "/opdrachten"), "Opdracht niet gevonden.", true);
  const questions = await query<{ id: string }>("select id from assignment_questions where assignment_id = $1", [assignment.id]);
  // The budget table of "Budgetplanning & prioriteiten" is saved with the same button; the amounts are the "Begroot" in Kosten.
  const lines = assignment.budget
    ? await query<{ id: string; name: string }>("select id, name from budget_items where couple_id = $1 and kind in ('category', 'own')", [ctx.couple.id])
    : [];
  const budget = assignment.budget ? readBudgetForm(formData.entries(), Object.fromEntries(lines.map((l) => [l.id, l.name]))) : null;
  if (budget?.errors.length) done(back, `Niets opgeslagen: controleer de bedragen (${budget.errors.join(", ")}). Gebruik bijvoorbeeld 1.250 of 1250,50.`, true);
  const budgetSaved = Boolean(budget && (budget.total !== undefined || budget.lines.length > 0));
  await tx(async (db) => {
    for (const q of questions) {
      if (formData.has(`a-${q.id}`)) {
        await query("update assignment_questions set answer = $2 where id = $1", [q.id, str(formData, `a-${q.id}`, 20_000)], db);
      }
    }
    if (budget && budget.total !== undefined) await query("update couples set total_budget_cents = $2 where id = $1", [ctx.couple.id, budget.total], db);
    for (const line of budget?.lines ?? []) {
      if (lines.some((l) => l.id === line.id)) await query("update budget_items set budget_cents = $2 where id = $1", [line.id, line.cents], db);
    }
  });
  const submit = formData.get("intent") === "submit";
  if (submit) {
    await query("update assignments set submitted_at = coalesce(submitted_at, now()), ai_error = '' where id = $1", [assignment.id]);
    after(() => summariseLater(assignment.id));
    if (!ctx.isAdmin) {
      await logActivity(ctx.couple.id, ctx.account.id, `Opdracht ingestuurd: ${assignment.title}`);
      await sendMail({
        to: await sabineAddress(),
        replyTo: ctx.account.email,
        subject: `${coupleName(ctx.couple)} heeft "${assignment.title}" ingevuld`,
        log: { kind: "opdracht", coupleId: ctx.couple.id, sentBy: ctx.account.name },
        text: [
          `${ctx.account.name} heeft de opdracht "${assignment.title}" ingestuurd.`,
          `Bekijken:\n${appUrl()}${back}`,
          aiConfigured() ? "" : claudeSummaryHint(coupleName(ctx.couple), assignment.title, assignment.styling_source),
        ].filter(Boolean).join("\n\n"),
      });
    }
    const sent = aiConfigured() ? "De samenvatting staat hier over een minuutje." : "Sabine krijgt er een melding van en maakt de samenvatting.";
    done(back, budgetSaved ? `Opgeslagen en bijgewerkt in Kosten, en ingestuurd. ${sent}` : `Ingestuurd. ${sent}`);
  }
  await note(ctx, `Opdracht bijgewerkt: ${assignment.title}`);
  done(back, budgetSaved ? "Opgeslagen en bijgewerkt in Kosten." : "Antwoorden opgeslagen.");
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
  let names: Record<string, unknown> = {};
  try {
    names = JSON.parse(str(formData, "colorNames", 5000) || "{}");
  } catch {
    names = {};
  }
  const hexes = [...str(formData, "colors", 500).matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => m[0].toLowerCase());
  const palette = writePalette(readPalette(hexes, names));
  await query(
    `insert into styling_plans (couple_id, concept, colors, color_names, published, updated_at) values ($1, $2, $3::jsonb, $4::jsonb, $5, now())
     on conflict (couple_id) do update set concept = excluded.concept, colors = excluded.colors, color_names = excluded.color_names,
       published = excluded.published, updated_at = now()`,
    [ctx.couple.id, str(formData, "concept", 20_000), JSON.stringify(palette.colors), JSON.stringify(palette.names), formData.get("published") === "on"],
  );
  done(back, formData.get("published") === "on" ? "Stylingplan opgeslagen en zichtbaar voor het bruidspaar." : "Stylingplan opgeslagen (nog niet zichtbaar voor het bruidspaar).");
}

export async function stylingImage(formData: FormData) {
  const ctx = await ctxFrom(formData);
  // Also used from the moodboard part of the assignment; only back to a page of this couple.
  const wanted = str(formData, "back", 300);
  const back = wanted.startsWith(portal(ctx.couple.id, "/")) ? wanted : portal(ctx.couple.id, "/styling#moodboard");
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
  const back = "/beheer/instellingen/portaal";
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
