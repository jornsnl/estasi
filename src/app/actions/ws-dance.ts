"use server";

import { requireDance } from "@/lib/ws/access";
import { logActivity } from "@/lib/ws/couples";
import { one, query } from "@/lib/ws/db";
import { deleteFiles, storeUpload, UploadError } from "@/lib/ws/files";
import { done, str } from "@/lib/ws/redirect";

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
    const videos = rows(formData, ["videoUrl", "videoNote"]).map((r) => ({ url: url(r.videoUrl), note: r.videoNote.slice(0, 1000) })).filter((v) => v.url);
    await query("update dance_wishes set videos = $2::jsonb, clothing = $3, updated_at = now() where couple_id = $1", [
      ctx.couple.id, JSON.stringify(videos), str(formData, "clothing", 2000),
    ]);
  } else if (block === "4") {
    if (!ctx.isAdmin) done(back, "Dit blok vult Sabine in.", true);
    const videos = rows(formData, ["videoUrl", "videoNote"]).map((r) => ({ url: url(r.videoUrl), note: r.videoNote.slice(0, 1000) })).filter((v) => v.url);
    await query("update dance_wishes set sabine_notes = $2, sabine_videos = $3::jsonb, updated_at = now() where couple_id = $1", [
      ctx.couple.id, str(formData, "notes", 20_000), JSON.stringify(videos),
    ]);
  } else {
    done(back, "Onbekend blok.", true);
  }
  if (!ctx.isAdmin) await logActivity(ctx.couple.id, ctx.account.id, "Wensen voor de openingsdans bijgewerkt");
  done(back, "Opgeslagen.");
}
