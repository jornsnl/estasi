"use server";

import { requireOwner } from "@/lib/auth/session";
import { requireCoupleAdmin } from "@/lib/ws/access";
import { isUuid, query } from "@/lib/ws/db";
import { MAIL_PAUSE_MS, guestMailText, mailClosing } from "@/lib/ws/mail-format";
import { mailTransport, resendLogged, sendMail, sleep } from "@/lib/ws/mail";
import { done, str } from "@/lib/ws/redirect";
import { getSettings } from "@/lib/ws/settings";

/** Most guests Sabine mails in one go; the mails go out one by one, calmly (Resend: about two a second). */
const MAX_GUESTS = 150;

/**
 * Feedback 5.6: Sabine mails one or more guests from the portal. Every guest
 * gets an own mail with the fixed closing; replies go to the contact address.
 */
export async function sendGuestMail(formData: FormData) {
  const ctx = await requireCoupleAdmin(str(formData, "coupleId", 40));
  const ids = [...new Set(formData.getAll("guestId").map(String).filter(isUuid))].slice(0, MAX_GUESTS);
  const back = `/k/${ctx.couple.id}/gasten/mail?${ids.map((id) => `gast=${id}`).join("&")}`;
  const subject = str(formData, "subject", 300);
  const message = str(formData, "message", 20_000);
  if (ids.length === 0) done(`/k/${ctx.couple.id}/gasten`, "Kies eerst een of meer gasten.", true);
  if (!subject || !message) done(back, "Vul een onderwerp en een bericht in.", true);

  const guests = await query<{ id: string; first_name: string; last_name: string; email: string }>(
    "select id, first_name, last_name, email from guests where couple_id = $1 and id = any($2::uuid[]) order by last_name, first_name",
    [ctx.couple.id, ids],
  );
  const settings = await getSettings();
  const closing = mailClosing(settings, ctx.couple, ctx.kinds);
  let sent = 0;
  let failed = 0;
  const skipped: string[] = [];
  for (const [i, g] of guests.entries()) {
    const name = `${g.first_name} ${g.last_name}`.trim();
    if (!/^\S+@\S+\.\S+$/.test(g.email.trim())) {
      skipped.push(name);
      continue;
    }
    if (i > 0 && mailTransport() === "resend") await sleep(MAIL_PAUSE_MS);
    const ok = await sendMail({
      to: g.email,
      replyTo: settings.contact_email || undefined,
      subject,
      text: guestMailText(message, closing, g.first_name),
      log: { kind: "bericht", coupleId: ctx.couple.id, guestId: g.id, guestName: name, sentBy: ctx.account.name },
    });
    if (ok) sent++;
    else failed++;
  }
  const parts = [
    sent ? `${sent === 1 ? "1 mail" : `${sent} mails`} verstuurd` : "",
    failed ? `${failed === 1 ? "1 mail" : `${failed} mails`} mislukt (zie de foutreden hieronder)` : "",
    skipped.length ? `geen e-mailadres: ${skipped.join(", ")}` : "",
  ].filter(Boolean);
  done(`/k/${ctx.couple.id}/gasten/mails`, parts.join("; ") || "Er is niets verstuurd.", sent === 0);
}

/** Sends a failed mail from the history again (Sabine only). */
export async function retryMail(formData: FormData) {
  await requireOwner();
  const id = str(formData, "mailId", 40);
  const custom = str(formData, "back", 300);
  const back = custom.startsWith("/k/") || custom.startsWith("/beheer/") ? custom : "/beheer/bruidsparen/mails";
  const outcome = await resendLogged(id);
  done(back, outcome.ok ? "Opnieuw verstuurd." : `Opnieuw versturen mislukt: ${outcome.error}`, !outcome.ok);
}
