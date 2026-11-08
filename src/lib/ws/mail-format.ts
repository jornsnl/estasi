/**
 * Building an e-mail, kept free of server imports so it is unit tested.
 * Used by every way of sending (Resend, SMTP).
 */

export interface Mail {
  to: string | string[];
  subject: string;
  /** Plain text; a simple HTML version is made from it. */
  text: string;
  replyTo?: string;
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function toHtml(text: string): string {
  const body = escape(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#6B1E2E">$1</a>')}</p>`)
    .join("");
  return `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#2C2C2C;max-width:560px">${body}<p style="margin:24px 0 0;color:#8A8578;font-size:13px">Your Wedding Space · Estasi Weddings</p></div>`;
}

/** Unique, trimmed addresses; empty ones dropped. */
export const recipients = (to: string | string[]) =>
  [...new Set((Array.isArray(to) ? to : [to]).map((a) => a.trim()).filter(Boolean))];

/** The body for POST https://api.resend.com/emails. Resend takes at most 50 recipients per mail. */
export function resendPayload(mail: Mail, from: string) {
  return {
    from,
    to: recipients(mail.to).slice(0, 50),
    subject: mail.subject,
    text: mail.text,
    html: toHtml(mail.text),
    ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
  };
}

/** What a mail is, for the mail history. Stored as the key; shown with the label. */
export const MAIL_KINDS = {
  rsvp_bevestiging: "RSVP-bevestiging",
  rsvp_melding: "Melding nieuwe RSVP",
  bericht: "Bericht aan gast",
  uitnodiging_portaal: "Uitnodiging Wedding Space",
  inloglink: "Nieuwe inloglink",
  vraag: "Nieuwe vraag",
  antwoord: "Antwoord op vraag",
  opdracht: "Opdracht ingestuurd",
  favorieten: "Nieuwe favorieten",
  openingsdans: "Aanvraag openingsdans",
  meekijker_vraag: "Vraag meelopende cursist",
  meekijker_toegang: "Draaiboektoegang cursist",
  community: "Academy community",
  privebericht: "Academy privébericht",
  toegang: "Academy toegang loopt af",
  academy_feedback: "Academy feedback",
  overig: "Overig",
} as const;
export type MailKind = keyof typeof MAIL_KINDS;

export const mailKindLabel = (kind: string) => MAIL_KINDS[kind as MailKind] ?? kind;

/** Where a mail belongs in the history. */
export interface MailLogInfo {
  kind: MailKind;
  coupleId?: string | null;
  guestId?: string | null;
  responseId?: string | null;
  guestName?: string;
  /** Who had it sent (Sabine's name for her own mails). */
  sentBy?: string;
  /** Mails with a login link: the text is not kept and they are not sent again from the history. */
  sensitive?: boolean;
}

/** The text of an error as kept in the history: one line, not too long. */
export const mailError = (message: string) => message.replace(/\s+/g, " ").trim().slice(0, 500) || "Onbekende fout";

/**
 * The fixed closing under a mail from Sabine to a guest (feedback 5.6), from
 * the portal settings. "Ceremoniemeester" when the couple has a package of
 * kind cm, otherwise "Weddingplanner".
 */
export function mailClosing(
  settings: { contact_name: string; business_name: string; contact_phone: string; contact_email: string },
  couple: { partner1_first: string; partner2_first: string },
  kinds: string[],
): string {
  const names = [couple.partner1_first, couple.partner2_first].map((n) => n.trim()).filter(Boolean).join(" en ");
  const role = kinds.includes("cm") ? "Ceremoniemeester" : "Weddingplanner";
  return [
    "Met vriendelijke groet,",
    settings.contact_name,
    names ? `${role} van ${names}` : role,
    settings.business_name,
    settings.contact_phone,
    settings.contact_email,
  ]
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

/** A message to one guest: [voornaam] filled in, the closing always at the bottom. */
export function guestMailText(message: string, closing: string, firstName: string): string {
  const body = message.replace(/\[voornaam\]/gi, firstName.trim() || "gast").trim();
  return `${body}\n\n${closing}`;
}

/** Resend allows about two requests a second: wait this long between mails sent in one go. */
export const MAIL_PAUSE_MS = 600;
