import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * E-mail through SMTP (for example Resend or the mail host of
 * estasiweddings.nl). Without SMTP_HOST the mail goes to the server log, so
 * everything keeps working locally; callers learn whether it was really sent.
 */

const state = globalThis as unknown as { __wsMail?: Transporter | null };

function transporter(): Transporter | null {
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

export const mailConfigured = () => Boolean(process.env.SMTP_HOST);

export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export const adminNotifyEmail = () => process.env.ADMIN_NOTIFY_EMAIL ?? "";

export interface Mail {
  to: string | string[];
  subject: string;
  /** Plain text; a simple HTML version is made from it. */
  text: string;
  replyTo?: string;
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function toHtml(text: string): string {
  const body = escape(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#6B1E2E">$1</a>')}</p>`)
    .join("");
  return `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#2C2C2C;max-width:560px">${body}<p style="margin:24px 0 0;color:#8A8578;font-size:13px">Your Wedding Space · Estasi Weddings</p></div>`;
}

/** Sends the mail; returns false (and logs) when SMTP is not configured or sending failed. */
export async function sendMail(mail: Mail): Promise<boolean> {
  const to = (Array.isArray(mail.to) ? mail.to : [mail.to]).filter(Boolean);
  if (to.length === 0) return false;
  const smtp = transporter();
  if (!smtp) {
    console.info(`[mail] (niet verstuurd, geen SMTP) aan ${to.join(", ")}: ${mail.subject}\n${mail.text}`);
    return false;
  }
  try {
    await smtp.sendMail({
      from: process.env.MAIL_FROM ?? "Estasi Weddings <sabine@estasiweddings.nl>",
      to,
      replyTo: mail.replyTo,
      subject: mail.subject,
      text: mail.text,
      html: toHtml(mail.text),
    });
    return true;
  } catch (err) {
    console.error(`[mail] versturen mislukt aan ${to.join(", ")}: ${(err as Error).message}`);
    return false;
  }
}
