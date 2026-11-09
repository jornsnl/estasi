"use server";

import { requireOwner } from "@/lib/auth/session";
import { requireCouple, requireCoupleAdmin, type CoupleContext } from "@/lib/ws/access";
import { after } from "next/server";
import { aiConfigured, aiErrorMessage, stylingSummary } from "@/lib/ws/ai";
import { logActivity } from "@/lib/ws/couples";
import { isUuid, one, query } from "@/lib/ws/db";
import { deleteFiles, storeUpload, storeUploads, UploadError } from "@/lib/ws/files";
import { coupleName } from "@/lib/ws/format";
import { sabineAddress, appUrl, sendMail } from "@/lib/ws/mail";
import { moveRow } from "@/lib/ws/order";
import { claudeSummaryHint, saveStylingProposal, stylingPlaces, stylingSources } from "@/lib/ws/summaries";
import { done, str } from "@/lib/ws/redirect";

/**
 * Stylingplan per place and the assignment "Thema & Styling". The couple and
 * Sabine both edit places, items and images; "Klaargezet" is Sabine's on the day.
 */

type Ok = { ok: boolean; error?: string };
const page = (ctx: CoupleContext, anchor = "") => `/k/${ctx.couple.id}/styling${anchor}`;
const fromForm = (formData: FormData) => requireCouple(str(formData, "coupleId", 40));
async function note(ctx: CoupleContext, action: string) {
  if (!ctx.isAdmin) await logActivity(ctx.couple.id, ctx.account.id, action);
}
async function placeOf(ctx: CoupleContext, placeId: string) {
  if (!isUuid(placeId)) return null;
  return one<{ id: string; name: string }>("select id, name from styling_places where id = $1 and couple_id = $2", [placeId, ctx.couple.id]);
}

// Places -------------------------------------------------------------------------------------------

export async function savePlace(formData: FormData) {
  const ctx = await fromForm(formData);
  const name = str(formData, "name", 80);
  const placeId = str(formData, "placeId", 40);
  if (!ctx.planning) done(`/k/${ctx.couple.id}`, "Niet beschikbaar.", true);
  if (formData.get("intent") === "delete") {
    const place = await placeOf(ctx, placeId);
    if (place) {
      const files = await query<{ file_id: string }>("select file_id from styling_place_images where place_id = $1", [place.id]);
      await query("delete from styling_places where id = $1", [place.id]);
      if (files.length) await deleteFiles("delete from files where id = any($1::uuid[])", [files.map((f) => f.file_id)]);
    }
    done(page(ctx, "#plan"), "Plek verwijderd.");
  }
  if (!name) done(page(ctx, "#plan"), "Geef de plek een naam.", true);
  if (isUuid(placeId)) {
    await query("update styling_places set name = $3 where id = $1 and couple_id = $2", [placeId, ctx.couple.id, name]);
    done(page(ctx, `#p-${placeId}`), "Plek hernoemd.");
  }
  const row = await one<{ id: string }>(
    "insert into styling_places (couple_id, name, position) values ($1, $2, (select coalesce(max(position), 0) + 1 from styling_places where couple_id = $1)) returning id",
    [ctx.couple.id, name],
  );
  await note(ctx, `Plek "${name}" toegevoegd aan het stylingplan`);
  done(page(ctx, `#p-${row!.id}`), "Plek toegevoegd.");
}

export async function movePlace(formData: FormData) {
  const ctx = await fromForm(formData);
  const id = str(formData, "id", 40);
  if (await placeOf(ctx, id)) await moveRow("styling_places", id, ctx.couple.id, str(formData, "direction") === "up" ? "up" : "down");
  done(page(ctx, "#plan"), "Volgorde aangepast.");
}

// Items ---------------------------------------------------------------------------------------------

export async function addStylingItem(formData: FormData) {
  const ctx = await fromForm(formData);
  const place = await placeOf(ctx, str(formData, "placeId", 40));
  const what = str(formData, "what", 300);
  if (!place) done(page(ctx, "#plan"), "Plek niet gevonden.", true);
  if (!what) done(page(ctx, `#p-${place.id}`), "Vul in wat er moet komen.", true);
  await query(
    `insert into styling_items (couple_id, place_id, what, who, position)
     values ($1, $2, $3, $4, (select coalesce(max(position), 0) + 1 from styling_items where place_id = $2))`,
    [ctx.couple.id, place.id, what, str(formData, "who", 120)],
  );
  await note(ctx, "Stylingplan bijgewerkt");
  done(page(ctx, `#p-${place.id}`), "Toegevoegd.");
}

/** Edits from the list itself; "Klaargezet" only Sabine (on the day, also from the run sheet). */
export async function updateStylingItem(coupleId: string, itemId: string, change: { what?: string; who?: string; ready?: boolean }): Promise<Ok> {
  const ctx = await requireCouple(coupleId);
  if (!ctx.planning || !isUuid(itemId)) return { ok: false, error: "Niet gevonden." };
  const item = await one<{ draft: boolean }>("select draft from styling_items where id = $1 and couple_id = $2", [itemId, ctx.couple.id]);
  if (!item || (item.draft && !ctx.isAdmin)) return { ok: false, error: "Niet gevonden." };
  if (change.ready !== undefined) {
    if (!ctx.isAdmin) return { ok: false, error: "Sabine vinkt op de dag aan wat klaarstaat." };
    await query("update styling_items set ready = $2 where id = $1", [itemId, Boolean(change.ready)]);
  }
  if (change.what !== undefined) {
    const what = String(change.what).trim().slice(0, 300);
    if (!what) return { ok: false, error: "Mag niet leeg zijn." };
    await query("update styling_items set what = $2 where id = $1", [itemId, what]);
  }
  if (change.who !== undefined) await query("update styling_items set who = $2 where id = $1", [itemId, String(change.who).trim().slice(0, 120)]);
  return { ok: true };
}

export async function deleteStylingItem(formData: FormData) {
  const ctx = await fromForm(formData);
  const id = str(formData, "itemId", 40);
  if (isUuid(id)) await query("delete from styling_items where id = $1 and couple_id = $2 and (not draft or $3)", [id, ctx.couple.id, ctx.isAdmin]);
  done(page(ctx, `#p-${str(formData, "placeId", 40)}`), "Verwijderd.");
}

// Images per place ------------------------------------------------------------------------------------

export async function placeImages(formData: FormData) {
  const ctx = await fromForm(formData);
  const place = await placeOf(ctx, str(formData, "placeId", 40));
  if (!place) done(page(ctx, "#plan"), "Plek niet gevonden.", true);
  const back = page(ctx, `#p-${place.id}`);
  const imageId = str(formData, "imageId", 40);
  if (isUuid(imageId)) {
    await deleteFiles(
      "delete from files where id = (select file_id from styling_place_images where id = $1 and place_id = $2)",
      [imageId, place.id],
    );
    done(back, "Afbeelding verwijderd.");
  }
  try {
    const files = await storeUploads(formData.getAll("images"), { coupleId: ctx.couple.id, accountId: ctx.account.id, kind: "image" });
    if (files.length === 0) done(back, "Kies eerst een afbeelding.", true);
    for (const f of files) await query("insert into styling_place_images (couple_id, place_id, file_id) values ($1, $2, $3)", [ctx.couple.id, place.id, f.id]);
  } catch (err) {
    if (err instanceof UploadError) done(back, err.message, true);
    throw err;
  }
  await note(ctx, `Afbeelding toegevoegd bij ${place.name}`);
  done(back, "Afbeelding toegevoegd.");
}

// The assignment in parts -------------------------------------------------------------------------------

async function sectionOf(ctx: CoupleContext, sectionId: string) {
  if (!isUuid(sectionId)) return null;
  return one<{ id: string; assignment_id: string; fields: { key: string }[]; title: string }>(
    `select s.id, s.assignment_id, s.fields, s.title from assignment_sections s join assignments a on a.id = s.assignment_id
      where s.id = $1 and a.couple_id = $2`,
    [sectionId, ctx.couple.id],
  );
}

/** A note field: saved while typing (a few seconds after the last key). */
export async function saveSectionNote(coupleId: string, sectionId: string, key: string, text: string): Promise<Ok> {
  const ctx = await requireCouple(coupleId);
  const section = await sectionOf(ctx, sectionId);
  if (!section) return { ok: false, error: "Niet gevonden." };
  if (key === "__link") {
    await query("update assignment_sections set link = $2 where id = $1", [section.id, String(text).trim().slice(0, 500)]);
  } else {
    if (!section.fields.some((f) => f.key === key)) return { ok: false, error: "Onbekend veld." };
    await query("update assignment_sections set answers = answers || jsonb_build_object($2::text, $3::text) where id = $1", [section.id, key, String(text).slice(0, 20_000)]);
  }
  return { ok: true };
}

/**
 * "Opdracht afgerond". Ticking hides nothing. When every part is done for
 * the first time, Sabine gets a notice on her dashboard and a mail.
 */
export async function setSectionDone(coupleId: string, sectionId: string, isDone: boolean): Promise<Ok & { done?: number; total?: number; allDone?: boolean }> {
  const ctx = await requireCouple(coupleId);
  const section = await sectionOf(ctx, sectionId);
  if (!section) return { ok: false, error: "Niet gevonden." };
  await query("update assignment_sections set completed_at = case when $2 then coalesce(completed_at, now()) else null end where id = $1", [section.id, isDone]);
  const counts = (await one<{ done: number; total: number }>(
    "select count(*) filter (where completed_at is not null)::int as done, count(*)::int as total from assignment_sections where assignment_id = $1",
    [section.assignment_id],
  ))!;
  const allDone = counts.total > 0 && counts.done === counts.total;
  if (allDone) {
    const first = await one<{ title: string }>(
      "update assignments set completed_at = now(), submitted_at = coalesce(submitted_at, now()) where id = $1 and completed_at is null returning title",
      [section.assignment_id],
    );
    if (first && !ctx.isAdmin) {
      const isStyling = Boolean(await one("select 1 from assignments where id = $1 and styling_source", [section.assignment_id]));
      const link = `/k/${ctx.couple.id}/opdrachten/${section.assignment_id}`;
      await query("insert into admin_notices (couple_id, text, link) values ($1, $2, $3)", [
        ctx.couple.id, `${coupleName(ctx.couple)} hebben alle onderdelen van "${first.title}" afgerond`, link,
      ]);
      await logActivity(ctx.couple.id, ctx.account.id, `Alle onderdelen van ${first.title} afgerond`);
      await sendMail({
        to: await sabineAddress(),
        subject: `${coupleName(ctx.couple)} hebben "${first.title}" afgerond`,
        log: { kind: "opdracht", coupleId: ctx.couple.id, sentBy: ctx.account.name },
        text: [
          `${coupleName(ctx.couple)} hebben alle opdrachten van "${first.title}" afgerond.`,
          `Bekijken:\n${appUrl()}${link}`,
          !isStyling
            ? ""
            : aiConfigured()
              ? "Op de pagina Styling staat zo een eerste samenvatting als concept klaar; alleen jij ziet die tot je hem vrijgeeft."
              : claudeSummaryHint(coupleName(ctx.couple), first.title, true),
        ].filter(Boolean).join("\n\n"),
      });
      // A first draft right away, after the response, when there is none yet and this was the styling assignment.
      const coupleId = ctx.couple.id;
      if (aiConfigured() && isStyling) {
        after(async () => {
          const plan = await one<{ ai_draft: string }>("select ai_draft from styling_plans where couple_id = $1", [coupleId]);
          if (!plan?.ai_draft) await runStylingSummary(coupleId);
        });
      }
    }
  } else if (!isDone) {
    await query("update assignments set completed_at = null where id = $1", [section.assignment_id]);
  }
  return { ok: true, ...counts, allDone };
}

// AI summary into a draft styling plan (Sabine) ----------------------------------------------------------

type SummaryResult = { ok: true; count: number } | { ok: false; error: string; empty?: boolean };

/**
 * Makes the summary and the proposals per place from the answers. On failure
 * the reason is kept (ai_error) for Sabine; the couple never sees it.
 */
async function runStylingSummary(coupleId: string): Promise<SummaryResult> {
  const filled = await stylingSources(coupleId);
  if (filled.length === 0) return { ok: false, empty: true, error: "Er zijn nog geen antwoorden op de opdracht Thema & Styling om samen te vatten." };
  const places = await stylingPlaces(coupleId);
  let proposal;
  try {
    if (!aiConfigured()) throw new Error("not configured");
    proposal = await stylingSummary(filled, places.map((p) => p.name));
    if (!proposal.summary) throw new Error("Er kwam geen samenvatting terug. Probeer het opnieuw.");
  } catch (err) {
    const error = aiErrorMessage(err);
    console.error("[styling] samenvatting mislukt:", err);
    await query(
      `insert into styling_plans (couple_id, ai_error) values ($1, $2)
       on conflict (couple_id) do update set ai_error = excluded.ai_error`,
      [coupleId, error.slice(0, 300)],
    );
    return { ok: false, error };
  }
  const { count } = await saveStylingProposal(coupleId, proposal);
  return { ok: true, count };
}

/** "Samenvatting vernieuwen" (Sabine): returns a message for the button instead of a redirect. */
export async function refreshStylingSummary(coupleId: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  const ctx = await requireCoupleAdmin(coupleId);
  const result = await runStylingSummary(ctx.couple.id);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, message: `Samenvatting gemaakt met ${result.count} voorstellen. Alleen jij ziet ze; pas aan en geef vrij.` };
}

/** Releases the plan: the concept text and every proposed item become visible for the couple. */
export async function releaseStylingPlan(formData: FormData) {
  const ctx = await requireCoupleAdmin(str(formData, "coupleId", 40));
  await query("update styling_items set draft = false where couple_id = $1 and draft", [ctx.couple.id]);
  await query(
    `insert into styling_plans (couple_id, published, updated_at) values ($1, true, now())
     on conflict (couple_id) do update set published = true, updated_at = now()`,
    [ctx.couple.id],
  );
  done(page(ctx, "#plan"), "Stylingplan vrijgegeven: het bruidspaar ziet het nu.");
}

// Central texts of assignments in parts (Sabine) ----------------------------------------------------------

const ADMIN = "/beheer/bruidsparen/opdrachten";

/** "## Ceremonie" starts a note field with its own heading; the lines under it are its questions. */
function parseFields(text: string) {
  const blocks: { key: string; label: string; prompts: string[] }[] = [];
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith("##") || blocks.length === 0) {
      blocks.push({ key: `f${blocks.length + 1}`, label: line.startsWith("##") ? line.replace(/^#+\s*/, "") : "", prompts: [] });
      if (line.startsWith("##")) continue;
    }
    blocks[blocks.length - 1].prompts.push(line.replace(/^[-•*]\s*/, ""));
  }
  return blocks.length ? blocks : [{ key: "f1", label: "", prompts: [] }];
}

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

export async function saveTemplateSection(formData: FormData) {
  const owner = await requireOwner();
  const id = str(formData, "sectionId", 40);
  const section = isUuid(id) ? await one<{ id: string; template_id: string; kind: string; example_file_id: string | null }>("select id, template_id, kind, example_file_id from assignment_template_sections where id = $1", [id]) : null;
  if (!section) done(ADMIN, "Onderdeel niet gevonden.", true);
  const back = `${ADMIN}#s-${section.id}`;
  let example = section.example_file_id;
  try {
    const file = await storeUpload(formData.get("example"), { coupleId: null, accountId: owner.id, kind: "image" });
    if (file) example = file.id;
    if (formData.get("removeExample") === "on") example = null;
  } catch (err) {
    if (err instanceof UploadError) done(back, err.message, true);
    throw err;
  }
  await query(
    `update assignment_template_sections set title = $2, intro = $3, notice = $4, fields = $5::jsonb, tips = $6::jsonb, embeds = $7::jsonb, example_file_id = $8
      where id = $1`,
    [
      section.id, str(formData, "title", 200) || "Opdracht", str(formData, "intro", 5000), str(formData, "notice", 3000),
      JSON.stringify(section.kind === "notes" ? parseFields(str(formData, "fields", 10_000)) : []),
      JSON.stringify(lines(str(formData, "tips", 3000))),
      JSON.stringify(lines(str(formData, "embeds", 3000)).filter((u) => /^https:\/\/([a-z]+\.)?pinterest\.[a-z.]+\//i.test(u))),
      example,
    ],
  );
  if (formData.get("propagate") === "on") {
    // Also for couples who already have it: texts, questions and boards, never their answers.
    await query(
      `update assignment_sections s set title = t.title, intro = t.intro, notice = t.notice, tips = t.tips, embeds = t.embeds,
              example_file_id = t.example_file_id,
              fields = case when jsonb_array_length(t.fields) = jsonb_array_length(s.fields) then t.fields else s.fields end
         from assignment_template_sections t join assignments a2 on a2.template_id = t.template_id
        where t.id = $1 and s.assignment_id = a2.id and s.position = t.position`,
      [section.id],
    );
  }
  done(back, formData.get("propagate") === "on" ? "Opgeslagen, ook bij bestaande bruidsparen." : "Opgeslagen. Geldt voor nieuwe bruidsparen.");
}

export async function saveTemplateClosing(formData: FormData) {
  await requireOwner();
  const id = str(formData, "templateId", 40);
  if (isUuid(id)) {
    await query("update assignment_templates set closing = $2 where id = $1", [id, str(formData, "closing", 3000)]);
    if (formData.get("propagate") === "on") await query("update assignments set closing = $2 where template_id = $1", [id, str(formData, "closing", 3000)]);
  }
  done(`${ADMIN}#t-${id}`, "Afsluittekst opgeslagen.");
}

export async function markNoticesSeen() {
  await requireOwner();
  await query("update admin_notices set seen_at = now() where seen_at is null");
  done("/beheer/bruidsparen", "Gezien.");
}

/** The standard places every new couple starts with. */
export async function saveDefaultPlaces(formData: FormData) {
  await requireOwner();
  const places = [...new Set(lines(str(formData, "places", 3000)).map((p) => p.slice(0, 80)))].slice(0, 30);
  await query("update settings set default_styling_places = $1::jsonb", [JSON.stringify(places)]);
  done("/beheer/bruidsparen/standaardlijsten#plekken", "Standaardplekken opgeslagen. Geldt voor nieuwe bruidsparen.");
}
