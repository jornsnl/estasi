"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hit, isLimited } from "@/lib/auth/rate-limit";
import { one } from "@/lib/db";
import { signupToLead } from "@/lib/pipeline/signup";
import { addNote, createLead } from "@/lib/pipeline/server";
import { todayIso } from "@/lib/ws/format";
import { appUrl, sabineAddress, sendMail } from "@/lib/ws/mail";
import { str } from "@/lib/ws/redirect";

const PAGE = "/inschrijven";
const PER_IP = { max: 5, windowMs: 60 * 60_000 };

const back = (error: string): never => redirect(`${PAGE}?fout=${encodeURIComponent(error)}#aanmelden`);
const thanks = (): never => redirect(`${PAGE}?bedankt=1#aanmelden`);

/**
 * Public sign up for the Academy (no login). Every sign up becomes a lead in the
 * salespipeline (Nieuw, interest Academy, source Website), also someone who signs up
 * again (feedback Sabine: a second sign up only became a note on the first card, so
 * nothing new showed in the pipeline); the earlier card gets a note with a link. Sabine gets a mail with a link to the lead; the person a
 * short confirmation.
 */
export async function submitAcademySignup(formData: FormData) {
  // A filled in hidden field means a bot; pretend all went well.
  if (str(formData, "website")) thanks();

  const h = await headers();
  const ipKey = `academy-signup:${h.get("x-forwarded-for")?.split(",")[0]?.trim() || "onbekend"}`;
  if (isLimited(ipKey, PER_IP)) back("Er zijn veel aanmeldingen vanaf dit adres. Probeer het later opnieuw of mail Sabine.");

  const result = signupToLead(
    {
      name: str(formData, "name", 120),
      email: str(formData, "email", 200),
      phone: str(formData, "phone", 40),
      city: str(formData, "city", 120),
      package: str(formData, "package", 20),
      situation: str(formData, "situation", 20),
      motivation: str(formData, "motivation", 3000),
      heardFrom: str(formData, "heardFrom", 200),
      consent: formData.get("consent") === "on",
    },
    todayIso(),
  );
  if (!result.ok) back(result.error);
  const { lead, summary } = result as Extract<typeof result, { ok: true }>;
  hit(ipKey, PER_IP);

  // redirect() throws, so it stays outside the try: errors are collected first.
  let leadId = "";
  let saveError = "";
  try {
    // Feedback Sabine (8): every sign up is a card of its own under Nieuw, also when the same person
    // signed up before. An earlier open Academy lead with the same address gets a note pointing here.
    const earlier = await one<{ id: string; title: string }>(
      `select id, title from public.pipeline_leads
        where closed_at is null and interest = 'academy' and lower(email) = $1
        order by created_at desc limit 1`,
      [lead.email],
    );
    const created = await createLead({
      ...lead,
      stage: "nieuw",
      notes: earlier ? `${lead.notes}\n\nEerder ingeschreven: ${earlier.title} (${appUrl()}/beheer/pipeline/${earlier.id})` : lead.notes,
    });
    if (created.ok) {
      leadId = created.value.id;
      if (earlier) await addNote(earlier.id, `Opnieuw ingeschreven via de website: ${appUrl()}/beheer/pipeline/${leadId}`, null).catch(() => undefined);
    } else {
      console.error(`[inschrijven] lead niet opgeslagen: ${created.error}`);
      saveError = created.error;
    }
  } catch (err) {
    console.error(`[inschrijven] lead opslaan mislukt: ${(err as Error).message}`);
    saveError = "Het versturen lukte niet. Probeer het nog een keer of mail Sabine direct.";
  }
  if (saveError) back(saveError);

  // The lead is saved; a mail that fails must not undo that.
  try {
    const to = await sabineAddress();
    await Promise.all([
      sendMail({
        to,
        replyTo: lead.email,
        subject: `Nieuwe inschrijving Academy: ${lead.contact_name}`,
        text: [
          `${lead.contact_name} heeft zich ingeschreven via de website.`,
          `E-mail: ${lead.email}\nTelefoon: ${lead.phone}`,
          summary,
          `Bekijk de lead in de pipeline: ${appUrl()}/beheer/pipeline/${leadId}`,
        ].join("\n\n"),
        log: { kind: "academy_inschrijving" },
      }),
      sendMail({
        to: lead.email,
        replyTo: to || undefined,
        subject: "Je inschrijving voor de Future Weddings Academy",
        text: [
          `Hoi ${lead.contact_name.split(/\s+/)[0]},`,
          "Wat leuk dat je je hebt ingeschreven voor de Future Weddings Academy van Estasi Weddings!",
          "Sabine neemt binnen twee werkdagen contact met je op voor een persoonlijke kennismaking. Daarin bespreken we welk pakket bij je past, wanneer je kunt starten en beantwoorden we al je vragen.",
          "Tot snel!\n\nSabine\nEstasi Weddings",
        ].join("\n\n"),
        log: { kind: "academy_inschrijving" },
      }),
    ]);
  } catch (err) {
    console.error(`[inschrijven] mail mislukt: ${(err as Error).message}`);
  }

  thanks();
}
