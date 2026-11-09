"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/session";
import { requireCouple } from "@/lib/ws/access";
import { query } from "@/lib/ws/db";
import { str } from "@/lib/ws/redirect";
import { saveVideoSetting } from "@/lib/ws/video-setting";

/** De rondleiding (feedback 11): the tour video for every couple, and the welcome block on the start page. */

export async function saveTourVideo(formData: FormData) {
  const owner = await requireOwner();
  await saveVideoSetting(formData, "tour", owner.id, "/beheer/instellingen/portaal#rondleiding");
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
