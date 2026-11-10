import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { isUuid, one, query, wsConfigured } from "./db";
import { mailLogo } from "@/lib/brand-logos";
import { brandFor, mailError, recipients, resendPayload, senderAddress, toHtml, type Mail, type MailLogInfo } from "./mail-format";

export type { Mail, MailLogInfo };

/**
 * E-mail for Your Wedding Space (invitations, questions, RSVP confirmations,
 * notices for Sabine). In order of preference:
 *   1. Resend's HTTP API with RESEND_API_KEY (no SMTP ports needed);
 *   2. SMTP with SMTP_HOST (any provider, Resend's SMTP works too);
 *   3. nothing configured: the mail goes to the server log, so everything
 *      keeps working locally. Callers learn whether it was really sent.
 * MAIL_FROM must be an address on a domain verified at the provider.
 */

const state = globalThis as unknown as { __wsMail?: Transporter | null };

function smtp(): Transporter | null {
  if (state.__wsMail === undefined) {
    const host = process.env.SMTP_HOST;
    state.__wsMail = host
      ? nodemailer.createTransport({
          host,
          port: Number(process.env.SMTP_PORT ?? 465),
          secure: Number(process.env.SMTP_PORT ?? 465) === 465,
          auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        })
      : null;
  }
  return state.__wsMail;
}

const resendKey = () => (process.env.RESEND_API_KEY ?? "").trim().replace(/^["']|["']$/g, "");

export const mailTransport = (): "resend" | "smtp" | "log" => (resendKey() ? "resend" : process.env.SMTP_HOST ? "smtp" : "log");

export const mailConfigured = () => mailTransport() !== "log";

const from = () => senderAddress(process.env.MAIL_FROM, process.env.MAIL_FROM_NAME || undefined);

/** The sender every mail goes out with. */
export const mailFrom = from;

/**
 * The public address of the app, for links in mails and to share. Forgives
 * the usual slips in APP_URL (quotes, spaces, no https://, a trailing slash):
 * a link without https:// opens as about:blank#blocked in some browsers.
 */
export function appUrl(): string {
  const raw = (process.env.APP_URL ?? "").trim().replace(/^["']|["']$/g, "").trim();
  if (!raw) return "http://localhost:3000";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "http://localhost:3000";
  }
}

export const adminNotifyEmail = () => (process.env.ADMIN_NOTIFY_EMAIL ?? "").trim();

/**
 * Where notices for Sabine go (new question, assignment sent in, dance
 * request...): ADMIN_NOTIFY_EMAIL, else the contact address of the portal
 * settings. Without the fallback an unset ADMIN_NOTIFY_EMAIL meant those mails
 * silently went nowhere (feedback: a dance request never arrived).
 */
export async function sabineAddress(): Promise<string> {
  const fromEnv = adminNotifyEmail();
  if (fromEnv) return fromEnv;
  if (!wsConfigured()) return "";
  const row = await one<{ contact_email: string }>("select contact_email from settings where id = true").catch(() => null);
  return (row?.contact_email ?? "").trim();
}

async function viaResend(mail: Mail): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify(resendPayload(mail, from())),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) return;
    // Too many at once (about two a second): wait a moment and try once more.
    if (response.status === 429 && attempt === 0) {
      await sleep(1_100);
      continue;
    }
    // Resend explains what is wrong (unverified domain, invalid key, rate limit) in the body.
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend ${response.status}: ${detail.slice(0, 300)}`);
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Outcome = { ok: true } | { ok: false; error: string };

/** One attempt to send, without the history. */
async function deliver(mail: Mail, to: string[]): Promise<Outcome> {
  const transport = mailTransport();
  if (transport === "log") {
    console.info(`[mail] (niet verstuurd, geen RESEND_API_KEY of SMTP) aan ${to.join(", ")}: ${mail.subject}\n${mail.text}`);
    return { ok: false, error: "Niet verstuurd: het versturen van e-mail staat niet ingesteld (geen RESEND_API_KEY of SMTP)." };
  }
  try {
    // Never let the logo stop a mail: without it the header shows the name only.
    if (!mail.logo) mail = { ...mail, logo: await mailLogo(mail.brand ?? "estasi", appUrl()).catch(() => undefined) };
    if (transport === "resend") await viaResend({ ...mail, to });
    else await smtp()!.sendMail({ from: from(), to, replyTo: mail.replyTo, subject: mail.subject, text: mail.text, html: toHtml(mail.text, mail.brand, mail.subject, mail.logo) });
    return { ok: true };
  } catch (err) {
    // "fetch failed" alone says little: the cause names the network problem (DNS, timeout, refused).
    const cause = (err as Error & { cause?: { message?: string; code?: string } }).cause;
    const why = cause ? ` (${cause.code ?? cause.message ?? "onbekende oorzaak"})` : "";
    console.error(`[mail] versturen mislukt via ${transport} aan ${to.join(", ")}: ${(err as Error).message}${why}`);
    return { ok: false, error: mailError(`${(err as Error).message}${why}`) };
  }
}

/**
 * The one place every mail of Wedding Space goes through: sends it and keeps
 * it in the mail history (feedback 5.5), sent or failed. Returns false when
 * nothing is configured or sending failed.
 */
export async function sendMail(mail: Mail & { log?: MailLogInfo }): Promise<boolean> {
  const to = recipients(mail.to);
  if (to.length === 0) {
    // Keep it in the history as failed, so a missing address is seen instead of a mail that silently never left.
    console.error(`[mail] geen ontvanger voor "${mail.subject}"`);
    await logMail(mail, [], { ok: false, error: "Geen ontvanger: stel ADMIN_NOTIFY_EMAIL of het contactadres bij de portaalinstellingen in." });
    return false;
  }
  const outcome = await deliver({ ...mail, brand: mail.brand ?? brandFor(mail.log?.kind) }, to);
  await logMail(mail, to, outcome);
  return outcome.ok;
}

async function logMail(mail: Mail & { log?: MailLogInfo }, to: string[], outcome: Outcome) {
  if (!wsConfigured()) return;
  const log = mail.log ?? { kind: "overig" as const };
  try {
    await query(
      `insert into mail_log (couple_id, guest_id, response_id, guest_name, kind, to_email, subject, body, reply_to, retryable,
                             status, error, transport, sent_by_name)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        isUuid(log.coupleId) ? log.coupleId : null,
        isUuid(log.guestId) ? log.guestId : null,
        isUuid(log.responseId) ? log.responseId : null,
        (log.guestName ?? "").slice(0, 200),
        log.kind,
        to.join(", ").slice(0, 2000),
        mail.subject.slice(0, 500),
        log.sensitive ? "" : mail.text.slice(0, 50_000),
        mail.replyTo ?? "",
        !log.sensitive,
        outcome.ok ? "sent" : "failed",
        outcome.ok ? "" : outcome.error,
        mailTransport(),
        (log.sentBy ?? "").slice(0, 200),
      ],
    );
  } catch (err) {
    // The history must never stop a mail; say it in the log instead.
    console.error(`[mail] mailgeschiedenis bijwerken mislukt: ${(err as Error).message}`);
  }
}

/** Sends a failed mail from the history once more (Sabine only; the caller checks). */
export async function resendLogged(id: string): Promise<Outcome> {
  const row = isUuid(id)
    ? await one<{ to_email: string; subject: string; body: string; reply_to: string; retryable: boolean; status: string; kind: string }>(
        "select to_email, subject, body, reply_to, retryable, status, kind from mail_log where id = $1",
        [id],
      )
    : null;
  if (!row) return { ok: false, error: "Mail niet gevonden." };
  if (row.status === "sent") return { ok: false, error: "Deze mail is al verstuurd." };
  if (!row.retryable || !row.body) return { ok: false, error: "Deze mail bevat een inloglink en kan niet opnieuw worden verstuurd. Maak een nieuwe link bij Gegevens & delen." };
  const to = recipients(row.to_email.split(","));
  const outcome = await deliver({ to, subject: row.subject, text: row.body, replyTo: row.reply_to || undefined, brand: brandFor(row.kind) }, to);
  await query(
    `update mail_log set status = $2, error = $3, transport = $4, attempts = attempts + 1, updated_at = now() where id = $1`,
    [id, outcome.ok ? "sent" : "failed", outcome.ok ? "" : outcome.error, mailTransport()],
  );
  return outcome;
}
