/**
 * Building an e-mail, kept free of server imports so it is unit tested.
 * Used by every way of sending (Resend, SMTP).
 */

export interface Mail {
  to: string | string[];
  subject: string;
  /** Plain text; the branded HTML version is made from it. */
  text: string;
  replyTo?: string;
  /** Which part of Estasi the mail comes from: the name in the header and footer. */
  brand?: MailBrand;
}

export type MailBrand = "academy" | "wedding-space" | "estasi";

const BRAND_NAMES: Record<MailBrand, string> = {
  academy: "Future Weddings Academy",
  "wedding-space": "Your Wedding Space",
  estasi: "Estasi Weddings",
};

/** The colours of the brand (globals.css), written out because mail clients know no CSS variables. */
const C = {
  page: "#f5f0e8",
  card: "#ffffff",
  line: "#e6dfd0",
  bordeaux: "#6b1e2e",
  gold: "#a89650",
  goldLight: "#e8d9a8",
  goldInk: "#6e6131",
  ink: "#2c2c2c",
  muted: "#6f6a60",
};

const SERIF = "'Playfair Display','Cormorant Garamond',Georgia,'Times New Roman',serif";
const SANS = "Inter,'Helvetica Neue',Helvetica,Arial,sans-serif";

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const URL_RE = /(https?:\/\/[^\s<]+)/g;
const linkify = (s: string) => s.replace(URL_RE, `<a href="$1" style="color:${C.bordeaux};text-decoration:underline;word-break:break-all">$1</a>`);

/** A link alone on its line becomes a button, with the address small underneath for clients that block buttons. */
function button(url: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 8px"><tr>` +
    `<td bgcolor="${C.bordeaux}" style="border-radius:6px;background:${C.bordeaux}">` +
    `<a href="${url}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px">Openen</a>` +
    `</td></tr></table>` +
    `<p style="margin:0 0 18px;font-size:12px;line-height:1.5;color:${C.muted};word-break:break-all">Werkt de knop niet? Kopieer deze link:<br><a href="${url}" style="color:${C.muted}">${url}</a></p>`
  );
}

function paragraph(block: string): string {
  const lines = block.split("\n");
  const out: string[] = [];
  let text: string[] = [];
  const flush = () => {
    if (text.length) out.push(`<p style="margin:0 0 18px">${text.map(linkify).join("<br>")}</p>`);
    text = [];
  };
  for (const line of lines) {
    const t = line.trim();
    if (/^https?:\/\/\S+$/.test(t)) {
      flush();
      out.push(button(t));
    } else text.push(line);
  }
  flush();
  return out.join("");
}

/**
 * The one design every mail goes out in: cream page, white card with the
 * Estasi monogram, bordeaux and gold. Tables and inline styles only, so it
 * holds in Outlook and Gmail; no images, so nothing is blocked.
 */
export function toHtml(text: string, brand: MailBrand = "estasi", subject = ""): string {
  const name = BRAND_NAMES[brand];
  const body = escape(text.trim())
    .split(/\n{2,}/)
    .map(paragraph)
    .join("");
  const preheader = escape((text.trim().split("\n").find((l) => l.trim() && !/^https?:\/\//.test(l.trim())) ?? "").slice(0, 140));
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escape(subject || name)}</title>
<style>@media (max-width:480px){.card{padding:28px 22px 14px!important}}</style>
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page}">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page}">
<tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px">
<tr><td align="center" style="padding:0 0 22px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="44" height="44" align="center" valign="middle" bgcolor="${C.bordeaux}" style="width:44px;height:44px;border-radius:10px;background:${C.bordeaux};border:1px solid ${C.gold};font-family:${SERIF};font-size:26px;line-height:44px;font-weight:600;color:${C.goldLight}">E</td>
</tr></table>
<div style="margin:12px 0 0;font-family:${SERIF};font-size:20px;letter-spacing:0.5px;color:${C.bordeaux}">Estasi Weddings</div>
<div style="margin:4px 0 0;font-family:${SANS};font-size:11px;font-weight:600;letter-spacing:2.4px;text-transform:uppercase;color:${C.goldInk}">${name}</div>
</td></tr>
<tr><td class="card" bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-top:3px solid ${C.bordeaux};border-radius:10px;padding:36px 36px 22px;font-family:${SANS};font-size:15px;line-height:1.65;color:${C.ink}">
${body}
</td></tr>
<tr><td align="center" style="padding:22px 12px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted}">
<div style="width:40px;height:1px;background:${C.gold};margin:0 auto 14px;font-size:0;line-height:0">&nbsp;</div>
${name} · Estasi Weddings<br>
<a href="https://estasiweddings.nl" style="color:${C.goldInk};text-decoration:none">estasiweddings.nl</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
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
    html: toHtml(mail.text, mail.brand, mail.subject),
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
  academy_inschrijving: "Academy inschrijving",
  test: "Testmail",
  overig: "Overig",
} as const;
export type MailKind = keyof typeof MAIL_KINDS;

const ACADEMY_KINDS = new Set<string>(["community", "privebericht", "toegang", "academy_feedback", "academy_inschrijving"]);

/** The brand of a mail follows from its kind: Academy, Wedding Space, or plain Estasi for the rest. */
export const brandFor = (kind: string | undefined): MailBrand =>
  !kind || kind === "overig" || kind === "test" ? "estasi" : ACADEMY_KINDS.has(kind) ? "academy" : "wedding-space";

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
  const signature = [settings.contact_name, names ? `${role} van ${names}` : role, settings.business_name, settings.contact_phone, settings.contact_email]
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  // A blank line between the greeting and the name, as Sabine signs her own mails.
  return `Met vriendelijke groet,\n\n${signature}`;
}

/** The longest mail Sabine can send (feedback: mails of up to 4000 words). */
export const MAIL_MAX_WORDS = 4000;
/** Characters allowed alongside the word limit: 4000 long Dutch words with spaces fit easily. */
export const MAIL_MAX_CHARS = 60_000;

export const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/**
 * The sender as guests see it. MAIL_FROM may be a bare address or carry a
 * technical name ("Portal"); guests must always see "Estasi Weddings", or the
 * mail looks like spam (feedback). MAIL_FROM_NAME overrides the name.
 */
export function senderAddress(raw: string | undefined, name = "Estasi Weddings"): string {
  const value = (raw ?? "").trim().replace(/^["']|["']$/g, "").trim();
  const address = value.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/)?.[1] ?? (/^[^\s<>]+@[^\s<>]+$/.test(value) ? value : "sabine@estasiweddings.nl");
  const display = name.trim().replace(/["<>]/g, "") || "Estasi Weddings";
  return `${display} <${address}>`;
}

/** A message to one guest: [voornaam] filled in, the closing always at the bottom. */
export function guestMailText(message: string, closing: string, firstName: string): string {
  const body = message.replace(/\[voornaam\]/gi, firstName.trim() || "gast").trim();
  return `${body}\n\n${closing}`;
}

/** Resend allows about two requests a second: wait this long between mails sent in one go. */
export const MAIL_PAUSE_MS = 600;
