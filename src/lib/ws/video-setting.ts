import "server-only";
import { embedUrl } from "@/components/VideoEmbed";
import { one, query } from "./db";
import { deleteFiles, storeUpload, UploadError } from "./files";
import { done, str } from "./redirect";

/** The videos in settings that are the same for every couple: [link column, upload column]. */
const VIDEOS = {
  dance: ["dance_video_url", "dance_video_file_id"],
  tour: ["tour_video_url", "tour_video_file_id"],
} as const;
export type SettingVideoKind = keyof typeof VIDEOS;

const url = (v: string) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v).slice(0, 500);

/**
 * Saves the form of VideoSettingForm: a YouTube/Vimeo link, a new upload
 * (replaces the old one) or removing the upload. The caller has checked
 * that the owner is signed in. Ends with a redirect to `back`.
 */
export async function saveVideoSetting(formData: FormData, kind: SettingVideoKind, ownerId: string, back: string): Promise<never> {
  const [linkColumn, fileColumn] = VIDEOS[kind];
  const link = url(str(formData, "videoUrl", 500));
  if (link && !embedUrl(link)) done(back, "Deze link herkennen we niet. Gebruik een YouTube- of Vimeo-link, of upload de video.", true);
  const current = await one<Record<string, string | null>>(`select ${fileColumn} from settings where id = true`);
  let fileId = current?.[fileColumn] ?? null;
  try {
    const file = await storeUpload(formData.get("video"), { coupleId: null, accountId: ownerId, kind: "video" });
    if (file || formData.get("removeVideo") === "on") {
      if (fileId) await deleteFiles("delete from files where id = $1 and couple_id is null", [fileId]);
      fileId = file?.id ?? null;
    }
  } catch (err) {
    if (err instanceof UploadError) done(back, err.message, true);
    throw err;
  }
  await query(`update settings set ${linkColumn} = $1, ${fileColumn} = $2 where id = true`, [link, fileId]);
  done(back, "Video opgeslagen.");
}
