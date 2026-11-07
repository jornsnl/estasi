import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { recipients, resendPayload, toHtml, type Mail } from "./mail-format";

export type { Mail };

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

const from = () => process.env.MAIL_FROM ?? "Estasi Weddings <sabine@estasiweddings.nl>";

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

export const adminNotifyEmail = () => process.env.ADMIN_NOTIFY_EMAIL ?? "";

async function viaResend(mail: Mail): Promise<boolean> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(resendPayload(mail, from())),
    signal: AbortSignal.timeout(15_000),
  });
  if (response.ok) return true;
  // Resend explains what is wrong (unverified domain, invalid key, rate limit) in the body.
  const detail = await response.text().catch(() => "");
  throw new Error(`Resend ${response.status}: ${detail.slice(0, 300)}`);
}

/** Sends the mail; returns false (and logs) when nothing is configured or sending failed. */
export async function sendMail(mail: Mail): Promise<boolean> {
  const to = recipients(mail.to);
  if (to.length === 0) return false;
  const transport = mailTransport();
  if (transport === "log") {
    console.info(`[mail] (niet verstuurd, geen RESEND_API_KEY of SMTP) aan ${to.join(", ")}: ${mail.subject}\n${mail.text}`);
    return false;
  }
  try {
    if (transport === "resend") return await viaResend({ ...mail, to });
    await smtp()!.sendMail({ from: from(), to, replyTo: mail.replyTo, subject: mail.subject, text: mail.text, html: toHtml(mail.text) });
    return true;
  } catch (err) {
    // "fetch failed" alone says little: the cause names the network problem (DNS, timeout, refused).
    const cause = (err as Error & { cause?: { message?: string; code?: string } }).cause;
    const why = cause ? ` (${cause.code ?? cause.message ?? "onbekende oorzaak"})` : "";
    console.error(`[mail] versturen mislukt via ${transport} aan ${to.join(", ")}: ${(err as Error).message}${why}`);
    return false;
  }
}
