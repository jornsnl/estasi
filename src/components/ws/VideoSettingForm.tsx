import { SubmitButton } from "@/components/SubmitButton";
import { VideoEmbed } from "@/components/VideoEmbed";
import { FileUpload } from "@/components/ws/FileUpload";
import { directUploads } from "@/lib/ws/files";

/**
 * Beheer: one video for every couple, an upload or a YouTube/Vimeo link
 * (the opening dance, the tour). Saved by an action that uses
 * saveVideoSetting; the field names are fixed: videoUrl, video, removeVideo.
 */
export function VideoSettingForm({
  action,
  fileId,
  url,
  title,
  emptyText,
  submitLabel = "Video opslaan",
  fieldId = "videoUrl",
}: {
  action: (formData: FormData) => Promise<void>;
  fileId: string | null;
  url: string;
  title: string;
  emptyText: string;
  submitLabel?: string;
  /** Id of the link field, unique on the page. */
  fieldId?: string;
}) {
  return (
    <form action={action} className="card space-y-4 p-5">
      {fileId ? (
        <div className="space-y-1">
          <video controls preload="metadata" src={`/api/ws-bestanden/${fileId}`} className="aspect-video w-full max-w-xl rounded-xl bg-ink" />
          <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="removeVideo" /> Geüploade video verwijderen</label>
        </div>
      ) : url ? (
        <div className="max-w-xl"><VideoEmbed url={url} title={title} /></div>
      ) : (
        <p className="text-sm text-muted">{emptyText}</p>
      )}
      <div>
        <label className="label" htmlFor={fieldId}>YouTube- of Vimeo-link</label>
        <input id={fieldId} name="videoUrl" defaultValue={url} placeholder="https://www.youtube.com/watch?v=…" className="input" />
        <p className="mt-1 text-xs text-muted">Een geüploade video gaat voor de link. Laat het veld leeg om de link weg te halen.</p>
      </div>
      <div>
        <p className="label">Of upload een video (mp4, webm of mov, maximaal 45 MB)</p>
        <FileUpload name="video" coupleId={null} kind="video" direct={directUploads()} label={fileId ? "Andere video uploaden" : "Video uploaden"} />
      </div>
      <SubmitButton className="btn-primary" pendingText="Opslaan…">{submitLabel}</SubmitButton>
    </form>
  );
}
