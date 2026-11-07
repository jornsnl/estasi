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
