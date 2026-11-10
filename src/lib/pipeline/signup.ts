// Public Academy sign up (/inschrijven): the choices on the form and how an answer becomes a
// lead in the salespipeline. Pure, so it is unit tested (tests/academy-signup.test.ts); the
// server action is src/app/actions/academy-signup.ts.

export const SIGNUP_PACKAGES = ["A", "B", "twijfel"] as const;
export type SignupPackage = (typeof SIGNUP_PACKAGES)[number];

export const SIGNUP_PACKAGE_LABELS: Record<SignupPackage, string> = {
  A: "Pakket A · Online",
  B: "Pakket B · Online + praktijk",
  twijfel: "Weet ik nog niet",
};

export const SIGNUP_SITUATIONS = ["orienteren", "starten", "planner", "anders"] as const;
export type SignupSituation = (typeof SIGNUP_SITUATIONS)[number];

export const SIGNUP_SITUATION_LABELS: Record<SignupSituation, string> = {
  orienteren: "Ik oriënteer me op het vak",
  starten: "Ik wil starten als weddingplanner",
  planner: "Ik ben al planner en wil verder groeien",
  anders: "Anders",
};

export interface SignupInput {
  name: string;
  email: string;
  phone: string;
  city: string;
  package: string;
  situation: string;
  motivation: string;
  heardFrom: string;
  consent: boolean;
}

export interface SignupLead {
  title: string;
  contact_name: string;
  email: string;
  phone: string;
  location: string;
  interest: "academy";
  source: "website";
  notes: string;
  next_action: string;
  next_action_date: string;
}

export type SignupResult = { ok: true; lead: SignupLead; summary: string } | { ok: false; error: string };

const clip = (value: string, max: number) => value.trim().replace(/\s+\n/g, "\n").slice(0, max);
const isOneOf = <T extends string>(list: readonly T[], value: string): value is T => (list as readonly string[]).includes(value);

/**
 * Checks the form and builds the lead: on the board under Nieuw, interest Academy,
 * source Website, with a follow-up for today so it shows under Opvolgen.
 */
export function signupToLead(input: SignupInput, today: string): SignupResult {
  const name = clip(input.name, 120);
  const email = clip(input.email, 200).toLowerCase();
  const phone = clip(input.phone, 40);
  if (!name) return { ok: false, error: "Vul je naam in." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Vul een geldig e-mailadres in." };
  if (phone.replace(/\D/g, "").length < 8) return { ok: false, error: "Vul je telefoonnummer in, dan kan Sabine je bellen." };
  if (!input.consent) return { ok: false, error: "Geef toestemming dat we je gegevens gebruiken om contact op te nemen." };

  const pkg: SignupPackage = isOneOf(SIGNUP_PACKAGES, input.package) ? input.package : "twijfel";
  const situation = isOneOf(SIGNUP_SITUATIONS, input.situation) ? input.situation : null;
  const city = clip(input.city, 120);
  const motivation = clip(input.motivation, 3000);
  const heardFrom = clip(input.heardFrom, 200);

  const summary = [
    `Pakket: ${SIGNUP_PACKAGE_LABELS[pkg]}`,
    situation ? `Situatie: ${SIGNUP_SITUATION_LABELS[situation]}` : "",
    city ? `Woonplaats: ${city}` : "",
    heardFrom ? `Gehoord via: ${heardFrom}` : "",
    motivation ? `\nMotivatie:\n${motivation}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    ok: true,
    summary,
    lead: {
      title: `${name} · Academy`,
      contact_name: name,
      email,
      phone,
      location: city,
      interest: "academy",
      source: "website",
      notes: `Inschrijving via academy.estasiweddings.nl/inschrijven\n${summary}`,
      next_action: "Bellen voor een kennismaking over de Academy",
      next_action_date: today,
    },
  };
}
