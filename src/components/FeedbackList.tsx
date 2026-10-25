import type { Answer, Feedback } from "@/lib/data";
import { feedbackState } from "@/lib/domain/progress";
import { formatDateTime } from "@/lib/util/format";

export function FeedbackList({ answer, feedback, ownerName = "je opleider" }: { answer: Answer | undefined; feedback: Feedback[]; ownerName?: string }) {
  if (!answer) return null;
  const items = feedback.filter((f) => f.answerId === answer.id);
  if (items.length === 0) return null;
  const changed = feedbackState(answer, feedback) === "changed_after_feedback";
  return (
    <div className="mt-4 space-y-3">
      {items.map((f) => (
        <div key={f.id} className="rounded-lg border-l-2 border-gold bg-gold-soft/60 p-4">
          <p className="text-xs font-semibold tracking-wide text-gold-ink uppercase">
            Feedback van {ownerName} · {formatDateTime(f.createdAt)}
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-[15px]">{f.text}</p>
          {f.attachment && (
            <a href={`/api/bestanden/${f.attachment.id}`} className="mt-2 inline-block text-sm text-bordeaux underline">
              Bijlage: {f.attachment.name}
            </a>
          )}
        </div>
      ))}
      {changed && <p className="text-sm text-muted">Je hebt je antwoord aangepast nadat deze feedback is gegeven.</p>}
    </div>
  );
}
