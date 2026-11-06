import "server-only";
import { one, query } from "./db";
import type { Couple, Settings } from "./types";

export interface RsvpForm {
  id: string;
  couple_id: string;
  group_id: string | null;
  slug: string;
  name: string;
  intro: string;
  ask_part_of_day: boolean;
  ask_diet: boolean;
  ask_dresscode: boolean;
  dresscode: string;
  dresscode_note: string;
  confirmation_subject: string;
  confirmation_text: string;
  decline_subject: string;
  decline_text: string;
  header_file_id: string | null;
  header_position: number;
  qr_color: string;
  qr_background: string;
  open: boolean;
  position: number;
}

export type QuestionKind = "short" | "long" | "single" | "multi" | "yesno" | "number";

export interface RsvpQuestion {
  id: string;
  form_id: string;
  label: string;
  help: string;
  kind: QuestionKind;
  required: boolean;
  options: string[];
  max_choices: number | null;
  show_if_question_id: string | null;
  show_if_value: string;
  position: number;
}

export interface GuestGroup {
  id: string;
  couple_id: string;
  name: string;
  kind: "day" | "evening" | "custom";
  position: number;
}

export const QUESTION_KINDS: Record<QuestionKind, string> = {
  short: "Korte tekst",
  long: "Lange tekst",
  single: "Eén keuze",
  multi: "Meerdere keuzes",
  yesno: "Ja/nee",
  number: "Getal",
};

/** At most this many relations per guest. */
export const MAX_RELATIONS = 3;

/** "bruid" and "bruidegom" become the first names of the two partners. */
export function relationOptions(couple: Pick<Couple, "partner1_first" | "partner2_first">): string[] {
  const a = couple.partner1_first || "de bruid";
  const b = couple.partner2_first || "de bruidegom";
  return [
    `Familie van ${a}`,
    `Familie van ${b}`,
    `Vrienden met ${a}`,
    `Vrienden met ${b}`,
    "Vrienden met het bruidspaar",
    `Collega van ${a}`,
    `Collega van ${b}`,
    "Anders",
  ];
}

/** Standard texts for a new form; [namen], [datum], [voornaam], [antwoorden] and [dresscode] are filled in when used. */
export function defaultTexts(settings: Pick<Settings, "contact_name" | "contact_email" | "contact_phone">) {
  const contact = `${settings.contact_name}, ${settings.contact_email} of ${settings.contact_phone}`;
  return {
    intro:
      "Lieve vrienden en/of familie van het bruidspaar,\n\n" +
      "Via dit formulier kan je laten weten of je aanwezig bent bij de bruiloft van [namen] op [datum]. Willen jullie deze vragenlijst invullen? Zo kunnen wij alle voorbereidingen zorgvuldig afstemmen en zorgen voor een ontspannen en onvergetelijke dag.\n\n" +
      `Mocht je na het invullen van de vragenlijst nog een vraag of opmerking hebben of willen jullie graag een verrassing voorbereiden, dan mag dit gecommuniceerd worden met de ceremoniemeester: ${contact}.`,
    confirmationSubject: "Bedankt voor je aanmelding voor de bruiloft van [namen]",
    confirmation:
      "Lieve [voornaam],\n\nWat fijn dat je erbij bent! Je aanmelding voor de bruiloft van [namen] op [datum] is goed ontvangen.\n\n" +
      "Hieronder zie je een overzicht van wat je hebt ingevuld:\n\n[antwoorden]\n\n[dresscode]" +
      `Klopt er iets niet, heb je een vraag of wil je een verrassing voorbereiden? Neem dan contact op met ceremoniemeester ${contact}.\n\n` +
      `Tot op de bruiloft!\n\nHartelijke groet,\n${settings.contact_name}, Estasi Weddings`,
    declineSubject: "Bedankt voor je reactie op de uitnodiging van [namen]",
    decline:
      "Lieve [voornaam],\n\nBedankt dat je hebt laten weten dat je er helaas niet bij kunt zijn op de bruiloft van [namen] op [datum]. Jammer, maar fijn dat we het weten.\n\n" +
      "Hieronder zie je wat je hebt ingevuld:\n\n[antwoorden]\n\n" +
      `Verandert er toch iets in je planning? Neem dan contact op met ceremoniemeester ${contact}.\n\n` +
      `Hartelijke groet,\n${settings.contact_name}, Estasi Weddings`,
  };
}

/** A public form by its link; null when unknown, closed or the couple is archived. */
export async function publicForm(
  slug: string,
): Promise<{ form: RsvpForm; couple: Couple; questions: RsvpQuestion[]; group: GuestGroup | null } | null> {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(slug)) return null;
  const form = await one<RsvpForm>("select * from rsvp_forms where slug = $1 and open", [slug]);
  if (!form) return null;
  const couple = await one<Couple>("select * from couples where id = $1 and status <> 'archived'", [form.couple_id]);
  if (!couple) return null;
  const [questions, group] = await Promise.all([
    query<RsvpQuestion>("select * from rsvp_questions where form_id = $1 order by position", [form.id]),
    form.group_id ? one<GuestGroup>("select * from guest_groups where id = $1", [form.group_id]) : null,
  ]);
  return { form, couple, questions, group };
}

export async function groupsOf(coupleId: string): Promise<GuestGroup[]> {
  return query<GuestGroup>("select * from guest_groups where couple_id = $1 order by position, name", [coupleId]);
}

export { fillTemplate, isQuestionVisible, partyNames, splitName } from "./pure";
