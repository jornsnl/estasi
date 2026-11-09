"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/session";
import { requireCouple } from "@/lib/ws/access";
import { query } from "@/lib/ws/db";
import { done, str } from "@/lib/ws/redirect";
import { saveVideoSetting } from "@/lib/ws/video-setting";

/** De rondleiding (feedback 11): the tour video for every couple, and the welcome block on the start page. */

const TOUR = "/beheer/rondleiding";

export async function saveTourVideo(formData: FormData) {
  const owner = await requireOwner();
  await saveVideoSetting(formData, "tour", owner.id, `${TOUR}#video`);
}

/** The texts of the welcome block and of the pop-up (Systeem > Rondleiding). Empty fields fall back to the standard text. */
export async function saveTourTexts(formData: FormData) {
  await requireOwner();
  await query(
    `update settings set tour_welcome_title = $1, tour_welcome_text = $2, tour_popup_title = $3, tour_popup_text = $4 where id = true`,
    [
      str(formData, "welcomeTitle", 200) || "Welkom in Your Wedding Space!",
      str(formData, "welcomeText", 2000),
      str(formData, "popupTitle", 200) || "De rondleiding",
      str(formData, "popupText", 2000),
    ],
  );
  revalidatePath("/k", "layout");
  done(`${TOUR}#teksten`, "Teksten van de rondleiding opgeslagen.");
}

/**
 * The couple closes the welcome block: stored for the couple, so it stays
 * closed on every device and for both partners. Sabine looking along in the
 * portal does not close it for them.
 */
export async function dismissTourWelcome(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  if (ctx.isAdmin) return;
  await query(
    "insert into tour_welcome_dismissed (couple_id, dismissed_by_name) values ($1, $2) on conflict (couple_id) do nothing",
    [ctx.couple.id, ctx.account.name],
  );
  revalidatePath(`/k/${ctx.couple.id}`);
}
