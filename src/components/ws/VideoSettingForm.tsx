import { SubmitButton } from "@/components/SubmitButton";
import { VideoEmbed } from "@/components/VideoEmbed";

/**
 * Beheer: one video for every couple (the opening dance, the tour), always a
 * YouTube/Vimeo link that is embedded. Videos are not uploaded; a video
 * uploaded before that rule still shows until it is removed or replaced by a
 * link. Saved by an action that uses saveVideoSetting (fields videoUrl, removeVideo).
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
      {url ? (
        <div className="max-w-xl"><VideoEmbed url={url} title={title} /></div>
      ) : fileId ? (
        <div className="space-y-1">
          <video controls preload="metadata" src={`/api/ws-bestanden/${fileId}`} className="aspect-video w-full max-w-xl rounded-xl bg-ink" />
          <p className="text-xs text-muted">Dit is een eerder geüploade video. Vul een YouTube- of Vimeo-link in om hem te vervangen; de geüploade video wordt dan verwijderd.</p>
          <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="removeVideo" /> Geüploade video nu verwijderen</label>
        </div>
      ) : (
        <p className="text-sm text-muted">{emptyText}</p>
      )}
      <div>
        <label className="label" htmlFor={fieldId}>YouTube- of Vimeo-link</label>
        <input id={fieldId} name="videoUrl" defaultValue={url} placeholder="https://www.youtube.com/watch?v=…" className="input" />
        <p className="mt-1 text-xs text-muted">Zet de video op YouTube of Vimeo (eventueel niet openbaar) en plak hier de link. Laat het veld leeg om de video weg te halen.</p>
      </div>
      <SubmitButton className="btn-primary" pendingText="Opslaan…">{submitLabel}</SubmitButton>
    </form>
  );
}
