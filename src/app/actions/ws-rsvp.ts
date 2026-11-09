"use server";

import { randomBytes } from "crypto";
import { requireCouple, requireCoupleAdmin, type CoupleContext } from "@/lib/ws/access";
import { logActivity } from "@/lib/ws/couples";
import { isUuid, one, query } from "@/lib/ws/db";
import { deleteFiles, storeUpload, UploadError } from "@/lib/ws/files";
import { moveRow } from "@/lib/ws/order";
import { done, str } from "@/lib/ws/redirect";
import { MAIL_MAX_CHARS } from "@/lib/ws/mail-format";
import { defaultTexts, type QuestionKind } from "@/lib/ws/rsvp";
import { getSettings } from "@/lib/ws/settings";

/**
 * Gastenlijst & RSVP. Sabine manages groups, forms and questions; the couple
 * views, shares the links and QR codes and sees the results.
 */

const forms = (coupleId: string, anchor = "") => `/k/${coupleId}/gasten/formulieren${anchor}`;
const guests = (coupleId: string, anchor = "") => `/k/${coupleId}/gasten${anchor}`;
const uuid = (formData: FormData, name: string) => {
  const value = str(formData, name, 40);
  return isUuid(value) ? value : null;
};
const adminFrom = (formData: FormData) => requireCoupleAdmin(str(formData, "coupleId", 40));
async function note(ctx: CoupleContext, action: string) {
  if (!ctx.isAdmin) await logActivity(ctx.couple.id, ctx.account.id, action);
}
const HEX = /^#[0-9a-fA-F]{6}$/;

// Guest groups ---------------------------------------------------------------------------------------

export async function saveGroup(formData: FormData) {
  const ctx = await adminFrom(formData);
  const groupId = uuid(formData, "groupId");
  const name = str(formData, "name", 60);
  const back = forms(ctx.couple.id, "#groepen");
  if (!name) done(back, "Geef de groep een naam, bijvoorbeeld Middaggasten.", true);
  if (groupId) {
    await query("update guest_groups set name = $3 where id = $1 and couple_id = $2", [groupId, ctx.couple.id, name]);
    done(back, "Groep hernoemd.");
  }
  await query(
    "insert into guest_groups (couple_id, name, kind, position) values ($1, $2, 'custom', (select coalesce(max(position), 0) + 1 from guest_groups where couple_id = $1))",
    [ctx.couple.id, name],
  );
  done(back, `Groep "${name}" toegevoegd. Maak er nu een formulier voor.`);
}

export async function moveGroup(formData: FormData) {
  const ctx = await adminFrom(formData);
  const groupId = uuid(formData, "id");
  if (groupId) await moveRow("guest_groups", groupId, ctx.couple.id, str(formData, "direction") === "up" ? "up" : "down");
  done(forms(ctx.couple.id, "#groepen"), "Volgorde aangepast.");
}

export async function deleteGroup(formData: FormData) {
  const ctx = await adminFrom(formData);
  const groupId = uuid(formData, "groupId");
  const back = forms(ctx.couple.id, "#groepen");
  if (!groupId) done(back, "Groep niet gevonden.", true);
  const used = await one<{ n: number }>("select count(*)::int as n from guests where group_id = $1", [groupId]);
  if ((used?.n ?? 0) > 0) done(back, "Er staan nog gasten in deze groep. Verplaats of verwijder die eerst.", true);
  await query("delete from guest_groups where id = $1 and couple_id = $2 and kind = 'custom'", [groupId, ctx.couple.id]);
  done(back, "Groep verwijderd.");
}

// Forms ------------------------------------------------------------------------------------------------

/** A new form for a group, with Sabine's standard texts already filled in. */
export async function createForm(formData: FormData) {
  const ctx = await adminFrom(formData);
  const groupId = uuid(formData, "groupId");
  const group = groupId
    ? await one<{ id: string; name: string; kind: string }>("select id, name, kind from guest_groups where id = $1 and couple_id = $2", [groupId, ctx.couple.id])
    : null;
  if (!group) done(forms(ctx.couple.id), "Kies voor welke gastengroep het formulier is.", true);
  const texts = defaultTexts(await getSettings());
  const row = await one<{ id: string }>(
    `insert into rsvp_forms (couple_id, group_id, slug, name, intro, ask_part_of_day, ask_diet, confirmation_subject, confirmation_text,
                             decline_subject, decline_text, position)
     values ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10, (select coalesce(max(position), 0) + 1 from rsvp_forms where couple_id = $1))
     returning id`,
    [ctx.couple.id, group.id, randomBytes(9).toString("base64url"), str(formData, "name", 80) || group.name, texts.intro, group.kind === "day",
     texts.confirmationSubject, texts.confirmation, texts.declineSubject, texts.decline],
  );
  done(forms(ctx.couple.id, `#f-${row!.id}`), "Formulier aangemaakt met de standaardteksten. Pas aan wat nodig is.");
}

export async function saveForm(formData: FormData) {
  const ctx = await adminFrom(formData);
  const formId = uuid(formData, "formId");
  if (!formId) done(forms(ctx.couple.id), "Formulier niet gevonden.", true);
  const back = forms(ctx.couple.id, `#f-${formId}`);
  if (formData.get("intent") === "delete") {
    const old = await one<{ header_file_id: string | null }>("delete from rsvp_forms where id = $1 and couple_id = $2 returning header_file_id", [formId, ctx.couple.id]);
    if (old?.header_file_id) await deleteFiles("delete from files where id = $1", [old.header_file_id]);
    done(forms(ctx.couple.id), "Formulier verwijderd. Aanmeldingen blijven in de gastenlijst.");
  }
  const name = str(formData, "name", 80);
  if (!name) done(back, "Geef het formulier een naam.", true);
  const groupId = uuid(formData, "groupId");
  if (groupId && !(await one("select 1 from guest_groups where id = $1 and couple_id = $2", [groupId, ctx.couple.id]))) done(back, "Groep niet gevonden.", true);
  await query(
    `update rsvp_forms set name = $3, group_id = $4, intro = $5, ask_part_of_day = $6, ask_diet = $7, ask_dresscode = $8, dresscode = $9,
            dresscode_note = $10, confirmation_subject = $11, confirmation_text = $12, decline_subject = $13, decline_text = $14,
            qr_color = $15, qr_background = $16, open = $17
      where id = $1 and couple_id = $2`,
    [
      formId, ctx.couple.id, name, groupId, str(formData, "intro", 5000), formData.get("askPartOfDay") === "on", formData.get("askDiet") === "on",
      formData.get("askDresscode") === "on", str(formData, "dresscode", 300), str(formData, "dresscodeNote", 2000),
      str(formData, "confirmationSubject", 300), str(formData, "confirmationText", MAIL_MAX_CHARS), str(formData, "declineSubject", 300),
      str(formData, "declineText", MAIL_MAX_CHARS), HEX.test(str(formData, "qrColor", 7)) ? str(formData, "qrColor", 7) : "#2c2c2c",
      HEX.test(str(formData, "qrBackground", 7)) ? str(formData, "qrBackground", 7) : "#ffffff", formData.get("open") === "on",
    ],
  );
  done(back, "Formulier opgeslagen.");
}

/** Header photo: upload, replace, remove, and where it sits in the frame. */
export async function saveFormHeader(formData: FormData) {
  const ctx = await adminFrom(formData);
  const formId = uuid(formData, "formId");
  const form = formId
    ? await one<{ id: string; header_file_id: string | null }>("select id, header_file_id from rsvp_forms where id = $1 and couple_id = $2", [formId, ctx.couple.id])
    : null;
  if (!form) done(forms(ctx.couple.id), "Formulier niet gevonden.", true);
  const back = forms(ctx.couple.id, `#f-${form.id}`);
  const position = Math.max(0, Math.min(100, Math.round(Number(str(formData, "position", 4)) || 50)));
  if (formData.get("remove") === "on") {
    await query("update rsvp_forms set header_file_id = null where id = $1", [form.id]);
    if (form.header_file_id) await deleteFiles("delete from files where id = $1", [form.header_file_id]);
    done(back, "Headerfoto verwijderd. De coverfoto van het bruidspaar wordt gebruikt (of een rustige crème header).");
  }
  try {
    const file = await storeUpload(formData.get("header"), { coupleId: ctx.couple.id, accountId: ctx.account.id, kind: "image" });
    await query("update rsvp_forms set header_file_id = coalesce($2, header_file_id), header_position = $3 where id = $1", [form.id, file?.id ?? null, position]);
    if (file && form.header_file_id) await deleteFiles("delete from files where id = $1", [form.header_file_id]);
  } catch (err) {
    if (err instanceof UploadError) done(back, err.message, true);
    throw err;
  }
  done(back, "Headerfoto opgeslagen.");
}

// Questions ----------------------------------------------------------------------------------------------

const KINDS: QuestionKind[] = ["short", "long", "single", "multi", "yesno", "number"];

export async function saveQuestion(formData: FormData) {
  const ctx = await adminFrom(formData);
  const formId = uuid(formData, "formId");
  if (!formId || !(await one("select 1 from rsvp_forms where id = $1 and couple_id = $2", [formId, ctx.couple.id]))) {
    done(forms(ctx.couple.id), "Formulier niet gevonden.", true);
  }
  const back = forms(ctx.couple.id, `#f-${formId}`);
  const questionId = uuid(formData, "questionId");
  if (formData.get("intent") === "delete" && questionId) {
    await query("delete from rsvp_questions where id = $1 and form_id = $2", [questionId, formId]);
    done(back, "Vraag verwijderd.");
  }
  const label = str(formData, "label", 300);
  if (!label) done(back, "Vul de vraag in.", true);
  const kind = KINDS.find((k) => k === str(formData, "kind")) ?? "short";
  const options = str(formData, "options", 3000).split("\n").map((o) => o.trim()).filter(Boolean).slice(0, 30);
  if ((kind === "single" || kind === "multi") && options.length < 2) done(back, "Geef minstens twee keuzes, één per regel.", true);
  const max = kind === "multi" && str(formData, "maxChoices") ? Math.max(1, Math.min(options.length, Math.round(Number(str(formData, "maxChoices", 3)) || 1))) : null;
  let showIf = uuid(formData, "showIfQuestionId");
  if (showIf && (showIf === questionId || !(await one("select 1 from rsvp_questions where id = $1 and form_id = $2", [showIf, formId])))) showIf = null;
  const values = [
    label, str(formData, "help", 1000), kind, formData.get("required") === "on", JSON.stringify(kind === "single" || kind === "multi" ? options : []),
    max, showIf, showIf ? str(formData, "showIfValue", 200) : "",
  ];
  if (questionId) {
    await query(
      `update rsvp_questions set label = $3, help = $4, kind = $5, required = $6, options = $7::jsonb, max_choices = $8,
              show_if_question_id = $9, show_if_value = $10 where id = $1 and form_id = $2`,
      [questionId, formId, ...values],
    );
    done(back, "Vraag opgeslagen.");
  }
  await query(
    `insert into rsvp_questions (form_id, label, help, kind, required, options, max_choices, show_if_question_id, show_if_value, position)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, (select coalesce(max(position), 0) + 1 from rsvp_questions where form_id = $1))`,
    [formId, ...values],
  );
  done(back, "Vraag toegevoegd.");
}

export async function moveQuestion(formData: FormData) {
  const ctx = await adminFrom(formData);
  const formId = uuid(formData, "formId");
  const questionId = uuid(formData, "id");
  if (formId && questionId && (await one("select 1 from rsvp_forms where id = $1 and couple_id = $2", [formId, ctx.couple.id]))) {
    await moveRow("rsvp_questions", questionId, formId, str(formData, "direction") === "up" ? "up" : "down");
  }
  done(forms(ctx.couple.id, `#f-${formId}`), "Volgorde aangepast.");
}

// Guests --------------------------------------------------------------------------------------------------

/**
 * "Gast handmatig toevoegen": Sabine only, for instance for someone who
 * called. Counts everywhere, gets no confirmation mail.
 */
export async function saveGuest(formData: FormData) {
  const ctx = await adminFrom(formData);
  const guestId = uuid(formData, "guestId");
  const back = guests(ctx.couple.id);
  if (formData.get("intent") === "delete" && guestId) {
    await query("delete from guests where id = $1 and couple_id = $2", [guestId, ctx.couple.id]);
    done(back, "Gast verwijderd.");
  }
  const firstName = str(formData, "firstName", 80);
  if (!firstName) done(back, "Vul minstens een voornaam in.", true);
  const groupId = uuid(formData, "groupId");
  if (groupId && !(await one("select 1 from guest_groups where id = $1 and couple_id = $2", [groupId, ctx.couple.id]))) done(back, "Groep niet gevonden.", true);
  const attendance = ["yes", "no", "partial"].includes(str(formData, "attendance")) ? str(formData, "attendance") : "yes";
  const fields = [
    firstName, str(formData, "lastName", 80), str(formData, "relation", 200), str(formData, "email", 200), str(formData, "phone", 40),
    str(formData, "diet", 500), attendance, attendance === "partial" ? str(formData, "partialNote", 300) : "", formData.get("isKid") === "on",
    str(formData, "notes", 1000), groupId,
  ];
  if (guestId) {
    const before = await one<{ group_id: string | null; response_id: string | null }>("select group_id, response_id from guests where id = $1 and couple_id = $2", [guestId, ctx.couple.id]);
    await query(
      `update guests set first_name = $3, last_name = $4, relation = $5, email = $6, phone = $7, diet = $8, attendance = $9,
              partial_note = $10, is_kid = $11, notes = $12, group_id = $13 where id = $1 and couple_id = $2`,
      [guestId, ctx.couple.id, ...fields],
    );
    // Feedback: someone who signed up with others (Jan + 4 children) moves to another group together with them,
    // or only Jan shows up under "Te plaatsen" in a seating layout of that group.
    if (before?.response_id && before.group_id !== groupId) {
      await query(
        `update guests set group_id = $4 where couple_id = $1 and response_id = $2 and id <> $3 and group_id is not distinct from $5`,
        [ctx.couple.id, before.response_id, guestId, groupId, before.group_id],
      );
    }
    done(back, "Gast opgeslagen.");
  }
  await query(
    `insert into guests (couple_id, first_name, last_name, relation, email, phone, diet, attendance, partial_note, is_kid, notes, group_id, manual)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)`,
    [ctx.couple.id, ...fields],
  );
  done(back, `${firstName} toegevoegd (handmatig, zonder bevestigingsmail).`);
}

/** The dress code question answered with "Nee, ik ontvang graag meer informatie": handled. */
export async function markInfoHandled(formData: FormData) {
  const ctx = await adminFrom(formData);
  const responseId = uuid(formData, "responseId");
  if (responseId) await query("update rsvp_responses set info_handled_at = now() where id = $1 and couple_id = $2", [responseId, ctx.couple.id]);
  done(guests(ctx.couple.id, "#actiepunten"), "Afgehandeld.");
}

/**
 * The guest list on the day (draaiboek). Without a page reload:
 * "Aanwezig" only Sabine; star and finer relation both.
 */
export async function updateDayGuest(
  coupleId: string,
  guestId: string,
  change: { checkedIn?: boolean; important?: boolean; relationNote?: string },
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireCouple(coupleId);
  if (!ctx.planning || !isUuid(guestId)) return { ok: false, error: "Niet gevonden." };
  if (change.checkedIn !== undefined) {
    if (!ctx.isAdmin) return { ok: false, error: "Alleen Sabine vinkt gasten aan op de dag." };
    await query("update guests set checked_in = $3 where id = $1 and couple_id = $2", [guestId, ctx.couple.id, Boolean(change.checkedIn)]);
  }
  if (change.important !== undefined) {
    await query("update guests set important = $3 where id = $1 and couple_id = $2", [guestId, ctx.couple.id, Boolean(change.important)]);
  }
  if (change.relationNote !== undefined) {
    await query("update guests set relation_note = $3 where id = $1 and couple_id = $2", [guestId, ctx.couple.id, String(change.relationNote).trim().slice(0, 200)]);
    await note(ctx, "Relatie in de gastenlijst verfijnd");
  }
  return { ok: true };
}
