import { describe, expect, it } from "vitest";
import { guestMailText, mailClosing, mailError, mailKindLabel, recipients, resendPayload, toHtml } from "@/lib/ws/mail-format";

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
