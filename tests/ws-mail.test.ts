import { describe, expect, it } from "vitest";
import { brandFor, guestMailText, mailClosing, mailError, mailKindLabel, recipients, resendPayload, toHtml } from "@/lib/ws/mail-format";

describe("mail aan gasten", () => {
  const settings = { contact_name: "Sabine Tillema", business_name: "Estasi Weddings", contact_phone: "0637153899", contact_email: "sabine@estasiweddings.nl" };
  const couple = { partner1_first: "Anna", partner2_first: "Bram" };
  it("signs as ceremoniemeester only with a cm package", () => {
    expect(mailClosing(settings, couple, ["cm", "od"])).toBe(
      "Met vriendelijke groet,\nSabine Tillema\nCeremoniemeester van Anna en Bram\nEstasi Weddings\n0637153899\nsabine@estasiweddings.nl",
    );
    expect(mailClosing(settings, couple, ["wp"])).toContain("Weddingplanner van Anna en Bram");
    expect(mailClosing(settings, couple, [])).toContain("Weddingplanner van Anna en Bram");
  });
  it("leaves out empty settings and a missing partner", () => {
    expect(mailClosing({ ...settings, contact_phone: "" }, { partner1_first: "Anna", partner2_first: "" }, ["cm"])).toBe(
      "Met vriendelijke groet,\nSabine Tillema\nCeremoniemeester van Anna\nEstasi Weddings\nsabine@estasiweddings.nl",
    );
  });
  it("fills in the first name and always ends with the closing", () => {
    expect(guestMailText("Lieve [voornaam],\n\nTot snel!  ", "Groet", "Cor")).toBe("Lieve Cor,\n\nTot snel!\n\nGroet");
    expect(guestMailText("Hoi [Voornaam]", "Groet", "")).toBe("Hoi gast\n\nGroet");
  });
  it("labels kinds and keeps errors short", () => {
    expect(mailKindLabel("rsvp_bevestiging")).toBe("RSVP-bevestiging");
    expect(mailKindLabel("iets")).toBe("iets");
    expect(mailError("  Resend 403:\n  domain not verified ")).toBe("Resend 403: domain not verified");
    expect(mailError("")).toBe("Onbekende fout");
  });
});

describe("e-mail via Resend", () => {
  it("builds the Resend request", () => {
    expect(
      resendPayload({ to: [" a@x.nl", "a@x.nl", "", "b@x.nl"], subject: "Hoi", text: "Regel 1\n\nZie https://x.nl/k", replyTo: "s@x.nl" }, "Estasi <s@estasiweddings.nl>"),
    ).toEqual({
      from: "Estasi <s@estasiweddings.nl>",
      to: ["a@x.nl", "b@x.nl"],
      subject: "Hoi",
      text: "Regel 1\n\nZie https://x.nl/k",
      html: expect.stringContaining('<a href="https://x.nl/k"'),
      reply_to: "s@x.nl",
    });
  });
  it("leaves out reply_to when there is none and escapes HTML", () => {
    const p = resendPayload({ to: "a@x.nl", subject: "x", text: "<b>vet</b>" }, "f@x.nl");
    expect(p).not.toHaveProperty("reply_to");
    expect(toHtml("<b>")).toContain("&lt;b&gt;");
    expect(recipients("")).toEqual([]);
  });
});

describe("huisstijl van de mails", () => {
  it("turns a link alone on a line into a button and keeps inline links as links", () => {
    const html = toHtml("Hoi,\n\nLog in:\nhttps://x.nl/k?a=1&b=2\n\nOf lees https://x.nl/info verder.");
    expect(html).toContain(">Openen</a>");
    expect(html).toContain('href="https://x.nl/k?a=1&amp;b=2"');
    expect(html).toContain('<a href="https://x.nl/info"');
    expect(html.match(/>Openen<\/a>/g)).toHaveLength(1);
  });
  it("names the brand under the monogram and in the footer", () => {
    expect(toHtml("x", "academy")).toContain("Wedding Plan Academy");
    expect(toHtml("x", "wedding-space")).toContain("Your Wedding Space");
    expect(toHtml("x")).toContain("estasiweddings.nl");
    expect(toHtml("Eerste regel\nmeer", "estasi", "Onderwerp")).toContain("<title>Onderwerp</title>");
  });
  it("picks the brand from the kind of mail", () => {
    expect(brandFor("community")).toBe("academy");
    expect(brandFor("toegang")).toBe("academy");
    expect(brandFor("rsvp_bevestiging")).toBe("wedding-space");
    expect(brandFor("test")).toBe("estasi");
    expect(brandFor(undefined)).toBe("estasi");
  });
});
