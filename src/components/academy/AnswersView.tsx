import type { AssignmentAnswers, AssignmentBlock, AssignmentField, FieldAnswer } from "@/lib/data/types";
import { allFields, isFieldAnswered } from "@/lib/domain/assignment";
import { VideoLinkEmbed } from "./VideoLinkEmbed";

/**
 * An assignment with the answers to it, read only: for the owner (student
 * page, feedback) and for a portfolio. Pass the assignment of the version
 * (submission_versions.assignment) to show the questions as they were then.
 */
export function AnswersView({ assignment, answers }: { assignment: AssignmentBlock; answers: AssignmentAnswers }) {
  const known = new Set(allFields(assignment).map((f) => f.id));
  const orphans = Object.entries(answers).filter(([id]) => !known.has(id));
  return (
    <div className="space-y-4">
      {assignment.intro && <p className="text-sm whitespace-pre-wrap text-muted">{assignment.intro}</p>}
      {assignment.parts.map((part) => (
        <div key={part.id} className="space-y-3">
          {part.title && <p className="font-semibold">{part.title}</p>}
          {part.fields.map((field) => (
            <div key={field.id}>
              <p className="text-sm font-medium whitespace-pre-line">
                {field.label || "(veld zonder tekst)"}
                {field.required && <span className="ml-1 text-bordeaux">*</span>}
              </p>
              <FieldAnswerView field={field} answer={answers[field.id]} />
            </div>
          ))}
        </div>
      ))}
      {orphans.length > 0 && (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-xs text-muted">Antwoorden op velden die niet meer in de opdracht staan:</p>
          {orphans.map(([id, a]) => (
            <Loose key={id} answer={a} />
          ))}
        </div>
      )}
    </div>
  );
}

const empty = <p className="mt-1 text-sm text-muted">Niet ingevuld.</p>;

function FieldAnswerView({ field, answer }: { field: AssignmentField; answer: FieldAnswer | undefined }) {
  if (!isFieldAnswered(field, answer) && field.type !== "scale_rows") return empty;
  switch (field.type) {
    case "short":
    case "long":
      return <p className="mt-1 whitespace-pre-wrap">{answer?.text}</p>;
    case "single":
    case "multi":
      return (
        <div className="mt-1">
          <p>{field.type === "single" ? answer?.choice : (answer?.choices ?? []).join(", ")}</p>
          {answer?.comment && <p className="mt-1 text-sm whitespace-pre-wrap text-muted">Toelichting: {answer.comment}</p>}
        </div>
      );
    case "scale":
      return <p className="mt-1">Score: {answer?.score} (schaal {field.min} tot {field.max})</p>;
    case "scale_rows":
      if (!answer?.rows || Object.keys(answer.rows).length === 0) return empty;
      return (
        <table className="mt-1 w-full max-w-lg text-sm">
          <tbody>
            {field.rows.map((r) => (
              <tr key={r.id} className="border-b border-line/60">
                <td className="py-1 pr-3 whitespace-pre-line">{r.label}</td>
                <td className="py-1 text-right">{answer.rows?.[r.id] ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "video_link":
      return (
        <div className="mt-1 space-y-2">
          <VideoLinkEmbed url={answer?.url ?? ""} title={field.label || "Video"} />
          <a href={answer?.url} target="_blank" rel="noopener noreferrer" className="text-sm break-all text-bordeaux underline">{answer?.url}</a>
        </div>
      );
    case "upload":
      return (
        <ul className="mt-1 space-y-1">
          {(answer?.files ?? []).map((f) => (
            <li key={f.id}>
              <a href={`/api/bestanden/${f.id}`} className="text-bordeaux underline">{f.name}</a>
            </li>
          ))}
        </ul>
      );
  }
}

function Loose({ answer }: { answer: FieldAnswer }) {
  return (
    <div className="text-sm">
      {answer.text && <p className="whitespace-pre-wrap">{answer.text}</p>}
      {answer.choice && <p>{answer.choice}</p>}
      {answer.choices && answer.choices.length > 0 && <p>{answer.choices.join(", ")}</p>}
      {typeof answer.score === "number" && <p>Score: {answer.score}</p>}
      {answer.url && <p className="break-all">{answer.url}</p>}
      {(answer.files ?? []).map((f) => (
        <a key={f.id} href={`/api/bestanden/${f.id}`} className="block text-bordeaux underline">{f.name}</a>
      ))}
    </div>
  );
}
