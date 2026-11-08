import Link from "next/link";
import { Badge } from "@/components/Badge";
import { filesIn, isSubmitted, STATUS_LABELS } from "@/lib/domain/assignment";
import type { PortfolioItem, PortfolioModule, PortfolioVersion } from "@/lib/domain/portfolio";
import type { AssignmentAnswers, FileRef } from "@/lib/data/types";
import { formatDateTime } from "@/lib/util/format";
import { AnswersView } from "./AnswersView";

/**
 * The portfolio (Academy 10): per module and lesson every assignment with
 * the questions as they were when handed in, the answers, files and images,
 * the feedback and every earlier version. For the student (/portfolio) and
 * for Sabine (/beheer/cursisten/[userId]/portfolio).
 */
export function PortfolioView({ portfolio, audience, studentId }: { portfolio: PortfolioModule[]; audience: "student" | "owner"; studentId: string }) {
  if (portfolio.length === 0) {
    return (
      <div className="card p-8 text-center text-muted">
        {audience === "student"
          ? "Je portfolio vult zich vanzelf zodra je aan een opdracht begint."
          : "Deze cursist heeft nog geen opdrachten gemaakt."}
      </div>
    );
  }
  return (
    <div className="space-y-10">
      {portfolio.map((m) => (
        <section key={m.moduleId ?? "weg"} aria-label={m.title}>
          <h2 className="border-b-2 border-gold pb-1 text-3xl">{m.title}</h2>
          {m.moduleId === null && (
            <p className="mt-2 text-sm text-muted">Deze lessen zijn later uit de opleiding gehaald. Je werk blijft bewaard.</p>
          )}
          <div className="mt-4 space-y-6">
            {m.lessons.map((l) => (
              <div key={l.lessonId}>
                <h3 className="text-xl">
                  {m.moduleId && audience === "student" ? (
                    <Link href={`/les/${l.lessonId}`} className="hover:text-bordeaux">{l.title}</Link>
                  ) : m.moduleId ? (
                    <Link href={`/beheer/cursisten/${studentId}?les=${l.lessonId}`} className="hover:text-bordeaux">{l.title}</Link>
                  ) : (
                    l.title
                  )}
                </h3>
                <div className="mt-3 space-y-4">
                  {l.items.map((item) => (
                    <Item key={item.submissionId} item={item} audience={audience} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Item({ item, audience }: { item: PortfolioItem; audience: "student" | "owner" }) {
  const newestFirst = item.versions.slice().reverse();
  return (
    <article className="card p-5 print:break-inside-avoid">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-serif text-lg">{item.title}</h4>
        <Badge tone={isSubmitted(item.status) ? "success" : "neutral"}>{STATUS_LABELS[item.status]}</Badge>
        {item.graded && <Badge tone="gold">Eindopdracht</Badge>}
        {item.versions.length > 1 && <Badge>{item.versions.length} versies</Badge>}
      </div>

      {item.draft && (
        <div className="mt-4 rounded-md border border-dashed border-line p-4">
          <p className="mb-3 text-xs text-muted">
            {item.versions.length ? "Aangepast, nog niet opnieuw ingediend" : "Concept, nog niet ingediend"} · opgeslagen {formatDateTime(item.draft.updatedAt)}
          </p>
          <AnswersView assignment={item.draft.assignment} answers={item.draft.answers} />
          <Images answers={item.draft.answers} />
        </div>
      )}

      {newestFirst.map((v, i) => (
        <details key={v.id} open={i === 0} className="mt-4 rounded-md border border-line bg-white p-4 print:block">
          <summary className="cursor-pointer text-sm">
            <span className="font-medium">Versie {v.version}</span> · ingediend {formatDateTime(v.submittedAt)}
            {v.feedbackRequested && <span className="ml-2 text-bordeaux">feedback gevraagd</span>}
            {v.feedback.length > 0 && <span className="ml-2 text-success">feedback ontvangen</span>}
          </summary>
          <VersionBody version={v} audience={audience} />
        </details>
      ))}
    </article>
  );
}

function VersionBody({ version, audience }: { version: PortfolioVersion; audience: "student" | "owner" }) {
  return (
    <div className="mt-3">
      {version.questionForSabine && (
        <p className="mb-3 rounded-md bg-gold-soft/60 p-3 text-sm">
          <span className="font-medium">{audience === "student" ? "Je vraag aan Sabine:" : "Vraag aan jou:"}</span> {version.questionForSabine}
        </p>
      )}
      <AnswersView assignment={version.assignment} answers={version.answers} />
      <Images answers={version.answers} />
      {version.feedback.map((f) => (
        <div key={f.id} className="mt-4 rounded-md border-l-2 border-gold bg-cream/60 p-3 text-sm">
          <p className="text-xs text-muted">
            Feedback van Sabine · {formatDateTime(f.sentAt ?? f.createdAt)}
            {!f.sentAt && " · concept, nog niet verstuurd"}
          </p>
          <p className="mt-1 whitespace-pre-wrap">{f.text}</p>
          {f.attachment && <FileLink file={f.attachment} prefix="Bijlage: " />}
        </div>
      ))}
    </div>
  );
}

/** Pictures in the answers, shown as small previews (the file links are in the answers). */
function Images({ answers }: { answers: AssignmentAnswers }) {
  const images = filesIn(answers).filter((f) => f.mime.startsWith("image/"));
  if (images.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {images.map((f) => (
        <a key={f.id} href={`/api/bestanden/${f.id}`} target="_blank" rel="noreferrer" title={f.name}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/bestanden/${f.id}`} alt={f.name} className="h-32 w-auto max-w-[14rem] rounded-md border border-line object-cover" />
        </a>
      ))}
    </div>
  );
}

function FileLink({ file, prefix = "" }: { file: FileRef; prefix?: string }) {
  return (
    <a href={`/api/bestanden/${file.id}`} className="mt-1 block text-bordeaux underline">
      {prefix}
      {file.name}
    </a>
  );
}
