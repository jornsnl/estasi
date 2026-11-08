"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/session";
import { isUuid, one, query } from "@/lib/ws/db";
import { moveRow } from "@/lib/ws/order";
import { done, str } from "@/lib/ws/redirect";
import { isMoment, isNeed, isSpeechStatus, normalizeTime } from "@/lib/ws/speeches-pure";

/** Speeches (feedback 12): Sabine only. Every action checks the owner role first; couples never reach these. */

const page = (coupleId: string) => `/beheer/bruidsparen/speeches/${coupleId}`;

/** Adds a speech, or saves one (speechId set). */
export async function saveSpeech(formData: FormData) {
  await requireOwner();
  const coupleId = str(formData, "coupleId", 40);
  if (!isUuid(coupleId) || !(await one("select 1 from couples where id = $1", [coupleId]))) done("/beheer/bruidsparen/speeches", "Bruidspaar niet gevonden.", true);
  const speechId = str(formData, "speechId", 40);
  const back = `${page(coupleId)}${speechId ? `#speech-${speechId}` : "#toevoegen"}`;

  // Speaker: a guest of this couple, or a name typed in.
  const guestValue = str(formData, "guestId", 40);
  const guest = isUuid(guestValue)
    ? await one<{ id: string; first_name: string; last_name: string; phone: string; email: string }>(
        "select id, first_name, last_name, phone, email from guests where id = $1 and couple_id = $2",
        [guestValue, coupleId],
      )
    : null;
  const speakerName = guest ? `${guest.first_name} ${guest.last_name}`.trim() : str(formData, "speakerName", 200);
  if (!speakerName) done(back, "Kies een spreker uit de gastenlijst of vul een naam in.", true);

  const time = normalizeTime(str(formData, "plannedTime", 20));
  if (time === null) done(back, "Vul de geplande tijd in als uu:mm, bijvoorbeeld 20:15, of laat het veld leeg.", true);
  const durationText = str(formData, "duration", 5);
  const duration = durationText === "" ? null : Number(durationText.replace(",", "."));
  if (duration !== null && (!Number.isFinite(duration) || duration < 0 || duration > 600)) done(back, "Vul de duur in als een aantal minuten.", true);

  const momentValue = str(formData, "moment", 20);
  const moment = isMoment(momentValue) ? momentValue : "";
  const statusValue = str(formData, "status", 20);
  const status = isSpeechStatus(statusValue) ? statusValue : "aangemeld";
  const needs = [...new Set(formData.getAll("needs").map(String).filter(isNeed))];
  // A guest's phone and e-mail fill in the empty fields, so they do not have to be typed twice.
  const phone = str(formData, "phone", 60) || (guest?.phone ?? "");
  const email = str(formData, "email", 200) || (guest?.email ?? "");

  const values = [
    guest?.id ?? null,
    speakerName,
    str(formData, "relation", 200),
    moment,
    moment === "eigen" ? str(formData, "momentOther", 200) : "",
    time,
    duration === null ? null : Math.round(duration),
    needs,
    str(formData, "needsOther", 300),
    phone,
    email,
    status,
    formData.get("surprise") === "on",
    str(formData, "notes", 4000),
  ];

  if (speechId) {
    if (!isUuid(speechId)) done(page(coupleId), "Speech niet gevonden.", true);
    const row = await one(
      `update speeches set guest_id = $3, speaker_name = $4, relation = $5, moment = $6, moment_other = $7, planned_time = $8,
              duration_minutes = $9, needs = $10, needs_other = $11, phone = $12, email = $13, status = $14, surprise = $15, notes = $16,
              updated_at = now()
        where id = $1 and couple_id = $2 returning id`,
      [speechId, coupleId, ...values],
    );
    if (!row) done(page(coupleId), "Speech niet gevonden.", true);
    revalidatePath(page(coupleId));
    done(back, "Speech opgeslagen.");
  }
  const row = await one<{ id: string }>(
    `insert into speeches (couple_id, guest_id, speaker_name, relation, moment, moment_other, planned_time, duration_minutes, needs, needs_other,
                           phone, email, status, surprise, notes, position)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
             (select coalesce(max(position), 0) + 1 from speeches where couple_id = $1))
     returning id`,
    [coupleId, ...values],
  );
  revalidatePath(page(coupleId));
  done(`${page(coupleId)}#speech-${row!.id}`, "Speech toegevoegd.");
}

export async function deleteSpeech(formData: FormData) {
  await requireOwner();
  const coupleId = str(formData, "coupleId", 40);
  const speechId = str(formData, "speechId", 40);
  if (!isUuid(coupleId) || !isUuid(speechId)) done("/beheer/bruidsparen/speeches", "Speech niet gevonden.", true);
  const row = await one<{ speaker_name: string }>("delete from speeches where id = $1 and couple_id = $2 returning speaker_name", [speechId, coupleId]);
  if (row) {
    // Positions 1..n again.
    await query(
      `update speeches s set position = o.n from (select id, row_number() over (order by position, created_at) as n from speeches where couple_id = $1) o
        where o.id = s.id and s.position <> o.n`,
      [coupleId],
    );
  }
  revalidatePath(page(coupleId));
  done(page(coupleId), row ? `De speech van ${row.speaker_name} is verwijderd.` : "Speech niet gevonden.", !row);
}

/** Dragging or the arrow buttons: the speech goes to place `to` (0-based) within its couple, saved right away. */
export async function moveSpeech(id: string, to: number): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireOwner();
  if (!isUuid(id) || !Number.isInteger(to)) return { ok: false, error: "Ongeldige verplaatsing." };
  const speech = await one<{ couple_id: string }>("select couple_id from speeches where id = $1", [id]);
  if (!speech) return { ok: false, error: "Speech niet gevonden." };
  const moved = await moveRow("speeches", id, speech.couple_id, to);
  if (!moved) return { ok: false, error: "Deze speech kan niet verder die kant op." };
  revalidatePath(page(speech.couple_id));
  return { ok: true };
}
