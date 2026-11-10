import { sendPrivateMessage } from "@/app/actions/community";
import { SubmitButton } from "@/components/SubmitButton";
import { LIMITS } from "@/lib/community/rules";
import type { MessageView } from "@/lib/community/server";
import { formatDateTime } from "@/lib/util/format";
import { AttachmentPicker } from "./AttachmentPicker";
import { AutoRefresh } from "./AutoRefresh";
import { Attachments, Avatar, PlainText, VideoLink } from "./Content";

/** One private conversation between Sabine and a student, as either of them sees it. */
export function Conversation({
  viewerId,
  studentId,
  messages,
  canWrite,
  otherName,
  emptyText,
  closedText,
}: {
  viewerId: string;
  studentId: string;
  messages: MessageView[];
  canWrite: boolean;
  otherName: string;
  emptyText: string;
  closedText: string;
}) {
  return (
    <div className="space-y-4">
      <AutoRefresh seconds={30} />
      <ol className="card space-y-4 p-4 sm:p-6" aria-label={`Berichten met ${otherName}`}>
        {messages.length === 0 && <li className="py-6 text-center text-muted">{emptyText}</li>}
        {messages.map((message) => {
          const mine = message.author.id === viewerId;
          return (
            <li key={message.id} id={`pb-${message.id}`} className={`flex scroll-mt-20 items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              {/* Feedback Sabine: the profile photo of the writer next to every message. */}
              <Avatar name={message.author.name} owner={message.author.role === "owner"} userId={message.author.id} photoFileId={message.author.photoFileId} />
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 sm:max-w-[72%] ${mine ? "bg-bordeaux-soft" : "border border-line bg-cream"}`}>
                <p className="text-xs text-muted">
                  <span className="font-medium text-ink">{mine ? "Jij" : message.author.name}</span> · {formatDateTime(message.createdAt)}
                  {mine && message.readAt && " · gelezen"}
                </p>
                <div className="mt-1 space-y-2">
                  <PlainText text={message.body} className="text-[15px] leading-6" />
                  {message.videoUrl && <VideoLink url={message.videoUrl} title="Video" />}
                  <Attachments items={message.attachments} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {canWrite ? (
        <form action={sendPrivateMessage} className="card space-y-3 p-4 sm:p-5">
          <input type="hidden" name="studentId" value={studentId} />
          <label htmlFor="pb-tekst" className="label">
            Bericht aan {otherName}
          </label>
          <textarea id="pb-tekst" name="body" rows={3} maxLength={LIMITS.message} className="input" />
          <details className="text-sm">
            <summary className="cursor-pointer text-muted hover:text-ink">Video van YouTube of Vimeo toevoegen</summary>
            <input name="videoUrl" type="text" inputMode="url" placeholder="https://vimeo.com/…" className="input mt-2" />
          </details>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <AttachmentPicker conversation={studentId} />
            <SubmitButton pendingText="Versturen…">Versturen</SubmitButton>
          </div>
          <p className="hint">Alleen jij en {otherName} zien dit gesprek.</p>
        </form>
      ) : (
        <p className="rounded-lg border border-line bg-cream px-4 py-3 text-sm text-muted">{closedText}</p>
      )}
    </div>
  );
}
