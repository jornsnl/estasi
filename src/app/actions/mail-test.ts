"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/academy";
import { requireOwner } from "@/lib/auth/session";
import { appUrl, mailFrom, mailTransport, sendMail } from "@/lib/ws/mail";
import type { MailBrand } from "@/lib/ws/mail-format";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function done(message: string, isError = false): never {
  redirect(`/beheer/instellingen?${isError ? "fout" : "melding"}=${encodeURIComponent(message)}`);
}

/** Sends a test mail in the house style to an address of choice, so the Resend setup can be checked from the admin. */
export async function sendTestMail(formData: FormData) {
  const owner = await requireOwner();
  const to = String(formData.get("to") ?? "").trim().slice(0, 254);
  const brandValue = String(formData.get("brand") ?? "estasi");
  const brand: MailBrand = brandValue === "academy" || brandValue === "wedding-space" ? brandValue : "estasi";
  if (!EMAIL_RE.test(to)) done("Vul een geldig e-mailadres in voor de testmail.", true);

  const now = new Date().toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "long", timeStyle: "short" });
  const ok = await sendMail({
    to,
    subject: "Testmail van Estasi Weddings",
    brand,
    text: [
      "Hallo,",
      "Dit is een testmail vanuit het beheer. Komt deze mail goed aan, dan staat het versturen van e-mail goed ingesteld en zien alle mails er zo uit.",
      `Verstuurd op ${now} via ${mailTransport() === "resend" ? "Resend" : mailTransport() === "smtp" ? "SMTP" : "de serverlog"}, afzender ${mailFrom()}.`,
      `Zo ziet een knop naar een pagina eruit:\n${appUrl()}/beheer`,
      `Met vriendelijke groet,\n${owner.name || "Estasi Weddings"}`,
    ].join("\n\n"),
    log: { kind: "test", sentBy: owner.name },
  });
  await audit(owner, ok ? "Testmail verstuurd" : "Testmail mislukt", to);
  if (ok) done(`Testmail verstuurd naar ${to}. Kijk ook even in de spammap als hij niet binnen een minuut binnen is.`);
  done(
    mailTransport() === "log"
      ? "Niet verstuurd: er staat geen RESEND_API_KEY (of SMTP) ingesteld. De mail staat in de serverlog."
      : "Versturen mislukt. De reden van Resend staat in de Maillog (tab hierboven).",
    true,
  );
}
