"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { hit, isLimited } from "@/lib/auth/rate-limit";
import { coupleMembers } from "@/lib/ws/couples";
import { one, query, tx } from "@/lib/ws/db";
import { coupleName, formatDate } from "@/lib/ws/format";
import { syncInvitationChildren } from "@/lib/ws/invitations";
import { adminNotifyEmail, appUrl, sendMail } from "@/lib/ws/mail";
import { fillTemplate, isQuestionVisible, MAX_RELATIONS, publicForm, relationOptions, splitName } from "@/lib/ws/rsvp";
import { str } from "@/lib/ws/redirect";

const RSVP_PER_IP = { max: 20, windowMs: 15 * 60_000 };
const ATTENDANCE = { yes: "Aanwezig", partial: "Deel van de dag", no: "Afwezig" } as const;

/**
 * Public RSVP: no login. Every person gets an own row in the guest list
 * (with name, child yes/no and diet where given); people who signed up
 * together share the response and stay linked.
 */
export async function submitRsvp(formData: FormData) {
  const slug = str(formData, "slug", 60);
  const page = `/rsvp/${slug}`;
  const back = (error: string): never => redirect(`${page}?fout=${encodeURIComponent(error)}`);
  const found = await publicForm(slug);
  if (!found) redirect(page);
  const { form, couple, questions } = found;

  // A filled in hidden field means a bot; pretend all went well.
  if (str(formData, "website")) redirect(`${page}?bedankt=1`);
  const h = await headers();
  const ipKey = `rsvp:${h.get("x-forwarded-for")?.split(",")[0]?.trim() || "onbekend"}`;
  if (isLimited(ipKey, RSVP_PER_IP)) back("Er zijn veel aanmeldingen vanaf dit adres. Probeer het over een kwartier opnieuw.");
  hit(ipKey, RSVP_PER_IP);

  const firstName = str(formData, "firstName", 80);
  const lastName = str(formData, "lastName", 80);
  const email = str(formData, "email", 200).toLowerCase();
  const phone = str(formData, "phone", 40);
  const attending = (["yes", "no", "partial"] as const).find((a) => a === str(formData, "attending"));
  if (!firstName || !lastName) back("Vul je voor- en achternaam in.");
  if (!/^\S+@\S+\.\S+$/.test(email)) back("Vul een geldig e-mailadres in, dan sturen we je een bevestiging.");
  if (!phone) back("Vul je telefoonnummer in.");
  if (!attending || (attending === "partial" && !form.ask_part_of_day)) back("Laat weten of je erbij bent.");

  const allowed = relationOptions(couple);
  const chosen = formData.getAll("relation").map(String).filter((r) => allowed.includes(r)).slice(0, MAX_RELATIONS);
  if (chosen.length === 0) back("Kies je relatie tot het bruidspaar.");
  const relations = chosen.map((r) => (r === "Anders" ? str(formData, "relationOther", 120) || "Anders" : r));
  const relation = relations.join(", ");

  const coming = attending !== "no";
  const partialNote = attending === "partial" ? str(formData, "partialNote", 300) : "";
  if (attending === "partial" && !partialNote) back("Beschrijf welke tijden je aanwezig bent.");
  const partyCount = coming ? Math.max(1, Math.min(12, Math.round(Number(str(formData, "partyCount", 3)) || 1))) : 1;
  const diet = coming && form.ask_diet ? str(formData, "diet", 500) : "";
  const party = Array.from({ length: partyCount - 1 }, (_, i) => ({
    name: str(formData, `party_${i}_name`, 120),
    kid: formData.get(`party_${i}_kid`) === "on",
    diet: form.ask_diet ? str(formData, `party_${i}_diet`, 500) : "",
  }));
  if (party.some((g) => !g.name)) back("Vul de namen van de andere gasten in.");
  const dresscodeOk = coming && form.ask_dresscode ? (str(formData, "dresscodeOk") === "yes" ? true : str(formData, "dresscodeOk") === "no" ? false : null) : null;
  if (coming && form.ask_dresscode && dresscodeOk === null) back("Laat weten of de dresscode duidelijk is.");

  // Own questions: only those that are shown, with their own rules.
  const raw: Record<string, string | string[]> = {};
  for (const q of questions) raw[q.id] = q.kind === "multi" ? formData.getAll(`q-${q.id}`).map(String) : str(formData, `q-${q.id}`, 4000);
  const answers: { question: string; answer: string }[] = [];
  for (const q of questions) {
    if (!isQuestionVisible(q, questions, raw)) continue;
    let value = raw[q.id];
    if (q.kind === "multi") {
      const list = (value as string[]).filter((v) => q.options.includes(v)).slice(0, q.max_choices ?? q.options.length);
      value = list.join(", ");
    } else if (q.kind === "single" && value && !q.options.includes(value as string)) {
      value = "";
    } else if (q.kind === "yesno" && value && !["Ja", "Nee"].includes(value as string)) {
      value = "";
    } else if (q.kind === "number" && value && !Number.isFinite(Number(value))) {
      back(`"${q.label}": vul een getal in.`);
    }
    if (q.required && !value) back(`Vul "${q.label}" in.`);
    if (value) answers.push({ question: q.label, answer: value as string });
  }

  await tx(async (db) => {
    const response = await one<{ id: string }>(
      `insert into rsvp_responses (couple_id, form_id, first_name, last_name, email, phone, relation, relations, attending, partial_note, diet,
                                   dresscode_ok, answers, party_count)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13::jsonb, $14) returning id`,
      [couple.id, form.id, firstName, lastName, email, phone, relation, JSON.stringify(relations), attending, partialNote, diet, dresscodeOk,
       JSON.stringify(answers), partyCount],
      db,
    );
    await query(
      `insert into guests (couple_id, response_id, form_id, group_id, first_name, last_name, relation, email, phone, diet, attendance, partial_note, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, clock_timestamp())`,
      [couple.id, response!.id, form.id, form.group_id, firstName, lastName, relation, email, phone, diet, attending, partialNote],
      db,
    );
    for (const guest of party) {
      const { first, last } = splitName(guest.name);
      await query(
        `insert into guests (couple_id, response_id, form_id, group_id, first_name, last_name, relation, attendance, partial_note, is_kid, diet, notes, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, clock_timestamp())`,
        [couple.id, response!.id, form.id, form.group_id, first, last, relation, attending, partialNote, guest.kid, guest.diet,
         `Aangemeld door ${firstName} ${lastName}`],
        db,
      );
    }
  });

  // Children on the invitation list of this household now count as guests too.
  await syncInvitationChildren(couple.id).catch((err) => console.error("[rsvp] kinderen bijwerken mislukt", err));

  // The mail: Sabine's text with, at the bottom, everything that was filled in.
  const names = coupleName(couple);
  const date = couple.wedding_date ? formatDate(couple.wedding_date) : "de trouwdag";
  const summary = [
    `Naam: ${firstName} ${lastName}`,
    `E-mail: ${email}`,
    `Telefoon: ${phone}`,
    `Relatie: ${relation}`,
    `Aanwezigheid: ${ATTENDANCE[attending!]}${partialNote ? ` (${partialNote})` : ""}`,
    coming ? `Aantal personen: ${partyCount}` : "",
    diet ? `Dieetwensen en allergieën: ${diet}` : "",
    ...party.map((g, i) => `Gast ${i + 2}: ${g.name}${g.kid ? " (kind)" : ""}${g.diet ? `, dieet: ${g.diet}` : ""}`),
    dresscodeOk === null ? "" : `Dresscode duidelijk: ${dresscodeOk ? "ja" : "nee, graag meer informatie"}`,
    ...answers.map((a) => `${a.question}: ${a.answer}`),
  ].filter(Boolean).join("\n");
  const values = {
    namen: names,
    datum: date,
    voornaam: firstName,
    antwoorden: summary,
    dresscode: coming && form.ask_dresscode && form.dresscode ? `Dresscode: ${form.dresscode}${form.dresscode_note ? `\n${form.dresscode_note}` : ""}\n\n` : "",
  };
  const subject = coming ? form.confirmation_subject || "Bedankt voor je aanmelding voor de bruiloft van [namen]" : form.decline_subject || "Bedankt voor je reactie op de uitnodiging van [namen]";
  let body = fillTemplate(coming ? form.confirmation_text : form.decline_text, values).trim();
  if (!body) body = coming ? `Lieve ${firstName},\n\nWat fijn dat je erbij bent! Je aanmelding is goed ontvangen.` : `Lieve ${firstName},\n\nBedankt voor het laten weten.`;
  // The overview of the answers always comes along, also when the text has no [antwoorden].
  if (!/\[antwoorden\]/i.test(coming ? form.confirmation_text : form.decline_text)) body += `\n\nWat je hebt ingevuld:\n\n${summary}`;
  await sendMail({ to: email, subject: fillTemplate(subject, values), text: body });

  const members = (await coupleMembers(couple.id)).map((m) => m.email);
  await sendMail({
    to: [adminNotifyEmail(), ...members].filter(Boolean),
    subject: `Nieuwe RSVP (${form.name}) voor ${names}`,
    text: `${summary}\n\nGastenlijst: ${appUrl()}/k/${couple.id}/gasten`,
  });

  redirect(`${page}?bedankt=${coming ? "1" : "nee"}`);
}
