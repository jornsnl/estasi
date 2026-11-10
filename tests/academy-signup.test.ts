import { describe, expect, it } from "vitest";
import { signupToLead, type SignupInput } from "@/lib/pipeline/signup";

const base: SignupInput = {
  name: "  Lotte de Vries ",
  email: "Lotte@Voorbeeld.NL",
  phone: "06 12345678",
  city: "Utrecht",
  package: "B",
  situation: "starten",
  motivation: "Ik organiseer graag.",
  heardFrom: "Instagram",
  consent: true,
};

describe("Academy inschrijving naar lead", () => {
  it("maakt een Academy-lead van de website met opvolging vandaag", () => {
    const r = signupToLead(base, "2026-11-10");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lead).toMatchObject({
      title: "Lotte de Vries · Academy",
      contact_name: "Lotte de Vries",
      email: "lotte@voorbeeld.nl",
      interest: "academy",
      source: "website",
      location: "Utrecht",
      next_action_date: "2026-11-10",
    });
    expect(r.lead.notes).toContain("Pakket B · Online + praktijk");
    expect(r.lead.notes).toContain("Ik wil starten als weddingplanner");
    expect(r.lead.notes).toContain("Gehoord via: Instagram");
  });

  it("valt terug op 'weet ik nog niet' bij een onbekend pakket en laat een onbekende situatie weg", () => {
    const r = signupToLead({ ...base, package: "Z", situation: "hack" }, "2026-11-10");
    expect(r.ok && r.summary).toContain("Weet ik nog niet");
    expect(r.ok && r.summary).not.toContain("Situatie");
  });

  it("weigert zonder naam, geldig e-mailadres, telefoon of toestemming", () => {
    expect(signupToLead({ ...base, name: " " }, "2026-11-10").ok).toBe(false);
    expect(signupToLead({ ...base, email: "geen-adres" }, "2026-11-10").ok).toBe(false);
    expect(signupToLead({ ...base, phone: "123" }, "2026-11-10").ok).toBe(false);
    expect(signupToLead({ ...base, consent: false }, "2026-11-10").ok).toBe(false);
  });
});
