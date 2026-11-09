"use server";

import { requireOwner } from "@/lib/auth/session";
import { requireCouple, requireDance } from "@/lib/ws/access";
import { logActivity } from "@/lib/ws/couples";
import { isUuid, one, query } from "@/lib/ws/db";
import { deleteFiles, storeUpload, UploadError } from "@/lib/ws/files";
import { coupleName, formatDate, formatMoney, parseMoney } from "@/lib/ws/format";
import { sabineAddress, appUrl, sendMail } from "@/lib/ws/mail";
import { danceName } from "@/lib/ws/package-order";
import { done, str } from "@/lib/ws/redirect";
import { getSettings } from "@/lib/ws/settings";
import { saveVideoSetting } from "@/lib/ws/video-setting";
import { videoEmbed } from "@/lib/util/video";
import { MAX_DANCE_VIDEOS } from "@/lib/ws/dance";

/** De openingsdans: the couple fills in blocks 1 to 3, Sabine block 4 (and may change everything). */

const url = (v: string) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v).slice(0, 500);

function rows(formData: FormData, names: string[]) {
  const columns = names.map((n) => formData.getAll(n).map((v) => String(v).trim()));
  const count = Math.max(0, ...columns.map((c) => c.length));
  return Array.from({ length: Math.min(count, 20) }, (_, i) => Object.fromEntries(names.map((n, j) => [n, columns[j][i] ?? ""])));
}

export async function saveDance(formData: FormData) {
  const ctx = await requireDance(str(formData, "coupleId", 40));
  const block = str(formData, "block");
  const back = `/k/${ctx.couple.id}/openingsdans#blok-${block}`;
  await query("insert into dance_wishes (couple_id) values ($1) on conflict do nothing", [ctx.couple.id]);

  if (block === "1") {
    const experience = ["none", "some", "lots"].includes(str(formData, "experience")) ? str(formData, "experience") : "";
    await query(
      `update dance_wishes set description = $2, lifts = $3, dips = $4, spins = $5, special = $6, special_text = $7, experience = $8, updated_at = now()
        where couple_id = $1`,
      [ctx.couple.id, str(formData, "description", 10_000), formData.get("lifts") === "on", formData.get("dips") === "on", formData.get("spins") === "on",
       formData.get("special") === "on", str(formData, "specialText", 500), experience],
    );
  } else if (block === "2") {
    const songs = rows(formData, ["songTitle", "songArtist", "songLink", "songNote"])
      .map((r) => ({ title: r.songTitle.slice(0, 200), artist: r.songArtist.slice(0, 200), link: url(r.songLink), note: r.songNote.slice(0, 1000) }))
      .filter((s) => s.title || s.link);
    const current = await one<{ audio_file_id: string | null }>("select audio_file_id from dance_wishes where couple_id = $1", [ctx.couple.id]);
    let audio = current?.audio_file_id ?? null;
    try {
      const file = await storeUpload(formData.get("audio"), { coupleId: ctx.couple.id, accountId: ctx.account.id, kind: "audio" });
      if (file || formData.get("removeAudio") === "on") {
        if (audio) await deleteFiles("delete from files where id = $1 and couple_id = $2", [audio, ctx.couple.id]);
        audio = file?.id ?? null;
      }
    } catch (err) {
      if (err instanceof UploadError) done(back, err.message, true);
      throw err;
    }
    await query(
      "update dance_wishes set songs = $2::jsonb, song_mode = $3, audio_file_id = $4, updated_at = now() where couple_id = $1",
      [ctx.couple.id, JSON.stringify(songs), str(formData, "songMode") === "mix" ? "mix" : "first", audio],
    );
  } else if (block === "3") {
    const videos = rows(formData, ["videoUrl", "videoNote"]).map((r) => ({ url: url(r.videoUrl), note: r.videoNote.slice(0, 1000) })).filter((v) => v.url).slice(0, MAX_DANCE_VIDEOS);
    await query("update dance_wishes set videos = $2::jsonb, clothing = $3, updated_at = now() where couple_id = $1", [
      ctx.couple.id, JSON.stringify(videos), str(formData, "clothing", 2000),
    ]);
  } else if (block === "4") {
    if (!ctx.isAdmin) done(back, "Dit blok vult Sabine in.", true);
    const videos = rows(formData, ["videoUrl", "videoNote"]).map((r) => ({ url: url(r.videoUrl), note: r.videoNote.slice(0, 1000) })).filter((v) => v.url).slice(0, MAX_DANCE_VIDEOS);
    await query("update dance_wishes set sabine_notes = $2, sabine_videos = $3::jsonb, updated_at = now() where couple_id = $1", [
      ctx.couple.id, str(formData, "notes", 20_000), JSON.stringify(videos),
    ]);
  } else {
    done(back, "Onbekend blok.", true);
  }
  if (!ctx.isAdmin) await logActivity(ctx.couple.id, ctx.account.id, "Wensen voor de openingsdans bijgewerkt");
  done(back, "Opgeslagen.");
}

// Couples without the dance in their package (feedback 9.2, 9.3) -----------------------------------

/** "Ik heb interesse in een openingsdans": kept, and Sabine gets a mail. */
export async function requestDance(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  const back = `/k/${ctx.couple.id}/openingsdans#interesse`;
  const choice = str(formData, "packageId", 40);
  const message = str(formData, "message", 4000);
  const pkg =
    choice && choice !== "unknown" && isUuid(choice)
      ? await one<{ id: string; name: string; price_cents: number }>("select id, name, price_cents from packages where id = $1 and kind = 'od' and not archived", [choice])
      : null;
  if (choice !== "unknown" && !pkg) done(back, "Kies een pakket, of \"Ik weet het nog niet\".", true);
  const packageName = pkg ? danceName(pkg.name) : "Ik weet het nog niet";
  await query(
    "insert into dance_requests (couple_id, package_id, package_name, message, requested_by_name) values ($1, $2, $3, $4, $5)",
    [ctx.couple.id, pkg?.id ?? null, packageName, message, ctx.account.name],
  );
  // Feedback: the request also lands on Sabine's board (Taken), so it is never only in a mailbox.
  await query(
    `insert into tasks (couple_id, lane, title, position, created_by)
     values ($1, 'sabine', $2, coalesce((select max(position) + 1 from tasks where couple_id = $1 and lane = 'sabine'), 1), $3)`,
    [ctx.couple.id, `Openingsdans-aanvraag opvolgen: ${packageName}`.slice(0, 200), ctx.account.id],
  );
  if (!ctx.isAdmin) await logActivity(ctx.couple.id, ctx.account.id, `Interesse in een openingsdans (${packageName})`);
  const settings = await getSettings();
  const names = [ctx.couple.partner1_first, ctx.couple.partner2_first].filter((n) => n.trim()).join(" en ") || coupleName(ctx.couple);
  const replyTo = [ctx.couple.partner1_email, ctx.couple.partner2_email, ctx.account.email].find((e) => e && e.includes("@"));
  await sendMail({
    to: await sabineAddress(),
    replyTo,
    subject: `Interesse in een openingsdans: ${names}`,
    text: [
      `${names} hebben interesse in een openingsdans.`,
      "",
      `Namen: ${[`${ctx.couple.partner1_first} ${ctx.couple.partner1_last}`, `${ctx.couple.partner2_first} ${ctx.couple.partner2_last}`].map((n) => n.trim()).filter(Boolean).join(" en ")}`,
      `Trouwdatum: ${ctx.couple.wedding_date ? formatDate(ctx.couple.wedding_date) : "nog niet bekend"}`,
      `Pakket: ${packageName}${pkg?.price_cents ? ` (${formatMoney(pkg.price_cents)})` : ""}`,
      `Bericht: ${message || "(geen bericht)"}`,
      `Verstuurd door: ${ctx.account.name}${ctx.isAdmin ? " (beheer)" : ""}`,
      "",
      `Alle aanvragen: ${appUrl()}/beheer/bruidsparen/openingsdans`,
    ].join("\n"),
    log: { kind: "openingsdans", coupleId: ctx.couple.id, sentBy: ctx.account.name },
  });
  done(back, "Dank jullie wel! Sabine neemt binnenkort contact met jullie op.");
}

/** The video on the information page: an upload or a YouTube/Vimeo link, the same for every couple. */
export async function saveDanceVideo(formData: FormData) {
  const owner = await requireOwner();
  await saveVideoSetting(formData, "dance", owner.id, "/beheer/bruidsparen/openingsdans#video");
}

/** Videos two and three on the information page: YouTube or Vimeo links (the first is the video above). */
export async function saveDanceExtraVideos(formData: FormData) {
  await requireOwner();
  const back = "/beheer/bruidsparen/openingsdans#video";
  const links = formData.getAll("extraVideoUrl").map((v) => url(String(v).trim())).filter(Boolean).slice(0, MAX_DANCE_VIDEOS - 1);
  if (links.some((l) => !videoEmbed(l))) done(back, "Een van de links herkennen we niet. Gebruik links van YouTube of Vimeo.", true);
  await query("update settings set dance_extra_video_urls = $1::jsonb where id = true", [JSON.stringify(links)]);
  done(back, "Video's opgeslagen.");
}

/** Name, price and contents of a dance package card; the rest of the package stays as it is. */
export async function saveDanceOffer(formData: FormData) {
  await requireOwner();
  const id = str(formData, "packageId", 40);
  const back = "/beheer/bruidsparen/openingsdans#pakketten";
  let name = str(formData, "name", 120);
  if (!name) done(back, "Geef het pakket een naam.", true);
  if (!/^Openingsdans/i.test(name)) name = `Openingsdans: ${name}`;
  let price: number | null;
  try {
    price = parseMoney(str(formData, "price", 30));
  } catch (err) {
    done(back, (err as Error).message, true);
  }
  const description = str(formData, "description", 5000);
  if (isUuid(id)) {
    const row = await one("update packages set name = $2, price_cents = $3, description = $4 where id = $1 and kind = 'od' returning id", [id, name, price ?? 0, description]);
    done(back, row ? "Pakket opgeslagen." : "Pakket niet gevonden.", !row);
  }
  await query(
    `insert into packages (name, variant, price_cents, meetings, suppliers_enabled, description, kind, position)
     values ($1, '', $2, 0, false, $3, 'od', (select coalesce(max(position), 0) + 1 from packages))`,
    [name, price ?? 0, description],
  );
  done(back, "Pakket toegevoegd.");
}

export async function markDanceRequest(formData: FormData) {
  await requireOwner();
  const id = str(formData, "requestId", 40);
  const handled = formData.get("handled") === "1";
  if (isUuid(id)) await query("update dance_requests set handled_at = case when $2 then now() else null end where id = $1", [id, handled]);
  done("/beheer/bruidsparen/openingsdans#aanvragen", handled ? "Aanvraag afgehandeld." : "Aanvraag weer open.");
}
