import "server-only";
import { one, query } from "./db";
import type { Couple } from "./types";

export interface RsvpForm {
  id: string;
  couple_id: string;
  slug: string;
  name: string;
  intro: string;
  ask_part_of_day: boolean;
  ask_diet: boolean;
  dresscode: string;
  confirmation_text: string;
  decline_text: string;
  qr_color: string;
  qr_background: string;
  open: boolean;
  position: number;
}

export interface RsvpQuestion {
  id: string;
  form_id: string;
  label: string;
  kind: "text" | "yesno";
}

export const RELATIONS = [
  "Familie van de bruid",
  "Familie van de bruidegom",
  "Vriend(in) van de bruid",
  "Vriend(in) van de bruidegom",
  "Vriend(in) van het bruidspaar",
  "Collega van de bruid",
  "Collega van de bruidegom",
  "Anders",
];

/** A public form by its link; null when unknown, closed or the couple is archived. */
export async function publicForm(slug: string): Promise<{ form: RsvpForm; couple: Couple; questions: RsvpQuestion[] } | null> {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(slug)) return null;
  const form = await one<RsvpForm>("select * from rsvp_forms where slug = $1 and open", [slug]);
  if (!form) return null;
  const couple = await one<Couple>("select * from couples where id = $1 and status <> 'archived'", [form.couple_id]);
  if (!couple) return null;
  const questions = await query<RsvpQuestion>("select * from rsvp_questions where form_id = $1 order by position", [form.id]);
  return { form, couple, questions };
}

export { partyNames, splitName } from "./pure";
