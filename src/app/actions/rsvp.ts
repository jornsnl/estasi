"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { hit, isLimited } from "@/lib/auth/rate-limit";
import { coupleMembers } from "@/lib/ws/couples";
import { one, query, tx } from "@/lib/ws/db";
import { coupleName, formatDate } from "@/lib/ws/format";
import { adminNotifyEmail, appUrl, sendMail } from "@/lib/ws/mail";
import { partyNames, publicForm, RELATIONS, splitName } from "@/lib/ws/rsvp";
import { str } from "@/lib/ws/redirect";

const RSVP_PER_IP = { max: 20, windowMs: 15 * 60_000 };

/**
 * Public RSVP: no login. Every person gets an own row in the guest list
 * (so the total can be counted); people who signed up together share the
 * response and stay linked (h9.4).
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
  const attending = ["yes", "no", "partial"].includes(str(formData, "attending")) ? str(formData, "attending") : "";
  if (!firstName) back("Vul je voornaam in.");
  if (!/^\S+@\S+\.\S+$/.test(email)) back("Vul een geldig e-mailadres in, dan sturen we je een bevestiging.");
  if (!attending || (attending === "partial" && !form.ask_part_of_day)) back("Laat weten of je erbij bent.");
  const relationChoice = str(formData, "relation", 120);
  const relation = relationChoice === "Anders" ? str(formData, "relationOther", 120) || "Anders" : RELATIONS.includes(relationChoice) ? relationChoice : "";
  const partialNote = attending === "partial" ? str(formData, "partialNote", 300) : "";
  const diet = form.ask_diet ? str(formData, "diet", 500) : "";
  const dresscodeOk = form.dresscode ? (str(formData, "dresscodeOk") === "yes" ? true : str(formData, "dresscodeOk") === "no" ? false : null) : null;
  const answers = questions.map((q) => ({ question: q.label, answer: str(formData, `q-${q.id}`, 2000) }));
  const party = attending === "no" ? [] : partyNames(str(formData, "party", 1000));

  await tx(async (db) => {
    const response = await one<{ id: string }>(
      `insert into rsvp_responses (couple_id, form_id, first_name, last_name, email, phone, relation, attending, partial_note, diet, dresscode_ok, answers)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb) returning id`,
      [couple.id, form.id, firstName, lastName, email, str(formData, "phone", 40), relation, attending, partialNote, diet, dresscodeOk, JSON.stringify(answers)],
      db,
    );
    const primaryName = `${firstName} ${lastName}`.trim();
    await query(
      `insert into guests (couple_id, response_id, form_id, first_name, last_name, relation, email, phone, diet, attendance, partial_note)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [couple.id, response!.id, form.id, firstName, lastName, relation, email, str(formData, "phone", 40), diet, attending, partialNote],
      db,
    );
    for (const name of party) {
      const { first, last } = splitName(name);
      await query(
        `insert into guests (couple_id, response_id, form_id, first_name, last_name, relation, attendance, partial_note, notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [couple.id, response!.id, form.id, first, last, relation, attending, partialNote, `Aangemeld door ${primaryName}`],
        db,
      );
    }
  });

  const names = coupleName(couple);
  const yes = attending !== "no";
  const custom = yes ? form.confirmation_text : form.decline_text;
  const fallback = yes
    ? `Wat fijn dat je erbij bent op de bruiloft van ${names}${couple.wedding_date ? ` op ${formatDate(couple.wedding_date)}` : ""}! Je aanmelding is goed ontvangen.`
    : "Wat fijn dat je het hebt laten weten. Helaas kun je er niet bij zijn, maar bedankt voor het invullen van de vragenlijst.";
  await sendMail({
    to: email,
    subject: yes ? `Je aanmelding voor de bruiloft van ${names}` : `Bedankt voor je bericht, ${firstName}`,
    text: `Hoi ${firstName},\n\n${custom || fallback}\n\nHartelijke groet,\n${names}`,
  });

  const members = (await coupleMembers(couple.id)).map((m) => m.email);
  const summary = [
    `${firstName} ${lastName}`.trim() + (relation ? ` (${relation})` : ""),
    `Aanwezig: ${attending === "yes" ? "ja" : attending === "no" ? "nee" : `deel van de dag${partialNote ? `, ${partialNote}` : ""}`}`,
    party.length ? `Neemt mee: ${party.join(", ")}` : "",
    diet ? `Dieet/allergieën: ${diet}` : "",
  ].filter(Boolean).join("\n");
  await sendMail({
    to: [adminNotifyEmail(), ...members].filter(Boolean),
    subject: `Nieuwe RSVP (${form.name}) voor ${names}`,
    text: `${summary}\n\nGastenlijst: ${appUrl()}/k/${couple.id}/gasten`,
  });

  redirect(`${page}?bedankt=${yes ? "1" : "nee"}`);
}
