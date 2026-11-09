import Link from "next/link";
import { toggleTask } from "@/app/actions/ws-portal";
import { FeedbackStatusBadge } from "@/components/academy/FeedbackStatusBadge";
import { Notice } from "@/components/Notice";
import { listFeedbackRequests } from "@/lib/data/assignments";
import { stillOnTaskPage } from "@/lib/domain/feedback";
import { query } from "@/lib/ws/db";
import { coupleName, formatDate, formatDateTime, todayIso } from "@/lib/ws/format";

export const metadata = { title: "Taken" };

interface Row {
  id: string;
  title: string;
  deadline: string | null;
  couple_id: string;
  partner1_first: string;
  partner2_first: string;
  wedding_date: string | null;
}

interface OpenQuestion {
  id: string;
  body: string;
  asked_by_name: string;
  asked_at: Date;
  couple_id: string;
  partner1_first: string;
  partner2_first: string;
}

interface ToSummarise {
  id: string;
  title: string;
  submitted_at: Date;
  couple_id: string;
  partner1_first: string;
  partner2_first: string;
}

/**
 * Sabine's Taken page (h9.5, extended after feedback). Everything that waits
 * for her in one place:
 *   1. the "Sabine" column of every couple's task board, at most four per row;
 *   2. questions of couples that have no answer yet;
 *   3. assignments couples sent in that still need a summary (Thema & Styling...);
 *   4. feedback requests of students, Nieuw / Bezig met nakijken / Klaar. A
 *      request leaves the page once it is Klaar and the feedback was sent.
 */
export default async function SabineBoard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [rows, questions, summaries, feedback] = await Promise.all([
    query<Row>(
      `select t.id, t.title, t.deadline, c.id as couple_id, c.partner1_first, c.partner2_first, c.wedding_date
         from tasks t join couples c on c.id = t.couple_id
        where t.lane = 'sabine' and t.done_at is null and c.status <> 'archived'
        order by c.wedding_date nulls last, c.id, t.deadline nulls last, t.position`,
    ),
    query<OpenQuestion>(
      `select q.id, q.body, q.asked_by_name, q.asked_at, c.id as couple_id, c.partner1_first, c.partner2_first
         from questions q join couples c on c.id = q.couple_id
        where q.answered_at is null and c.status <> 'archived'
        order by q.asked_at`,
    ),
    query<ToSummarise>(
      `select a.id, a.title, a.submitted_at, c.id as couple_id, c.partner1_first, c.partner2_first
         from assignments a join couples c on c.id = a.couple_id
        where a.submitted_at is not null and coalesce(a.ai_summary, '') = '' and c.status <> 'archived'
        order by a.submitted_at`,
    ),
    listFeedbackRequests().then((list) => list.filter(stillOnTaskPage)).catch(() => []),
  ]);
  const groups = new Map<string, Row[]>();
  for (const row of rows) groups.set(row.couple_id, [...(groups.get(row.couple_id) ?? []), row]);
  const today = todayIso();
  const count = (n: number) => <span className="ml-2 rounded-full bg-cream-deep px-2 py-0.5 align-middle font-sans text-xs text-muted">{n}</span>;

  return (
    <div className="space-y-10">
      <header>
        <p className="eyebrow">Beheer</p>
        <h1 className="mt-1 text-3xl">Taken</h1>
        <p className="mt-1 text-sm text-muted">Alles wat op jou wacht: je taken per bruidspaar, open vragen, opdrachten om samen te vatten en feedback voor cursisten.</p>
      </header>
      <Notice searchParams={searchParams} />

      <section aria-labelledby="takenborden" className="space-y-3">
        <h2 id="takenborden" className="text-2xl">Takenborden per bruidspaar{count(rows.length)}</h2>
        {groups.size === 0 && <p className="card p-6 text-sm text-muted">Geen open taken. Heerlijk.</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...groups.values()].map((tasks) => {
            const c = tasks[0];
            return (
              <section key={c.couple_id} className="rounded-2xl bg-cream-deep/70 p-3">
                <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
                  <Link href={`/k/${c.couple_id}#takenlijst`} className="font-serif font-semibold hover:text-bordeaux">{coupleName(c)}</Link>
                  <span className="text-xs text-muted">{formatDate(c.wedding_date)}</span>
                </div>
                <ul className="space-y-2">
                  {tasks.map((t) => (
                    <li key={t.id} className="flex items-start gap-2 rounded-lg bg-white p-2.5 text-sm shadow-sm">
                      <form action={toggleTask}>
                        <input type="hidden" name="coupleId" value={c.couple_id} />
                        <input type="hidden" name="taskId" value={t.id} />
                        <input type="hidden" name="back" value="/beheer/bruidsparen/takenbord" />
                        <button type="submit" aria-label={`${t.title} afvinken`} title="Afvinken" className="mt-0.5 h-4 w-4 shrink-0 rounded border border-gold hover:bg-gold/20" />
                      </form>
                      <div className="min-w-0">
                        <p className="break-words">{t.title}</p>
                        {t.deadline && <p className={`text-xs ${t.deadline < today ? "text-bordeaux" : "text-muted"}`}>{formatDate(t.deadline, false)}{t.deadline < today ? " · te laat" : ""}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        <p className="text-xs text-muted">Nieuwe taken voor jezelf zet je in de kolom &quot;Sabine&quot; op de takenlijst van het bruidspaar.</p>
      </section>

      <section aria-labelledby="vragen" className="space-y-3">
        <h2 id="vragen" className="text-2xl">Openstaande vragen van bruidsparen{count(questions.length)}</h2>
        {questions.length === 0 ? (
          <p className="card p-5 text-sm text-muted">Alle vragen zijn beantwoord.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {questions.map((q) => (
              <li key={q.id}>
                <Link href={`/k/${q.couple_id}#vragenblok`} className="block px-4 py-3 hover:bg-cream/60">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{coupleName(q)}</span>
                    <span className="text-xs text-muted">{q.asked_by_name ? `${q.asked_by_name} · ` : ""}{formatDateTime(q.asked_at)}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{q.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="samenvatten" className="space-y-3">
        <h2 id="samenvatten" className="text-2xl">Ingeleverde opdrachten om samen te vatten{count(summaries.length)}</h2>
        {summaries.length === 0 ? (
          <p className="card p-5 text-sm text-muted">Geen ingeleverde opdrachten zonder samenvatting.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {summaries.map((a) => (
              <li key={a.id}>
                <Link href={`/k/${a.couple_id}/opdrachten/${a.id}`} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 hover:bg-cream/60">
                  <span><span className="font-medium">{a.title}</span> <span className="text-muted">· {coupleName(a)}</span></span>
                  <span className="text-xs text-muted">Ingeleverd {formatDateTime(a.submitted_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="cursisten" className="space-y-3">
        <h2 id="cursisten" className="text-2xl">Feedback voor cursisten{count(feedback.length)}</h2>
        {feedback.length === 0 ? (
          <p className="card p-5 text-sm text-muted">Geen feedbackverzoeken die op je wachten.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {feedback.map((f) => (
              <li key={f.versionId}>
                <Link href={`/beheer/feedback/${f.versionId}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-cream/60">
                  <span className="min-w-0">
                    <span className="font-medium">{f.studentName}</span>
                    <span className="text-muted"> · {f.assignment.title || f.lessonTitle || "Opdracht"}{f.moduleTitle ? ` (${f.moduleTitle})` : ""}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {f.feedbackStatus === "afgerond" && !f.lastSentAt && <span>feedback nog niet verstuurd</span>}
                    <FeedbackStatusBadge status={f.feedbackStatus} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
