import { describe, expect, it } from "vitest";
import { recipients, resendPayload, toHtml } from "@/lib/ws/mail-format";

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
