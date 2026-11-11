import Link from "next/link";
import { toggleTask } from "@/app/actions/ws-portal";
import { markSummaryDone } from "@/app/actions/ws-admin";
import { markDanceRequest } from "@/app/actions/ws-dance";
import { FeedbackStatusBadge } from "@/components/academy/FeedbackStatusBadge";
import { Notice } from "@/components/Notice";
import { loadSabineBoard, type Row } from "@/lib/ws/sabine-board";
import { coupleName, formatDate, formatDateTime, todayIso } from "@/lib/ws/format";

export const metadata = { title: "Taken" };

/**
 * Sabine's Taken page (h9.5, extended after feedback). Everything that waits
 * for her in one place:
 *   1. the "Sabine" column of every couple's task board, at most four per row;
 *   2. questions of couples that have no answer yet;
 *   3. requests of couples for an opening dance package, until marked handled;
 *   4. Thema & Styling once a couple sent it in, until Sabine ticks off that she made the summary
 *      (Budgetplanning never needs one);
 *   5. feedback requests of students, Nieuw / Bezig met nakijken / Klaar. A
 *      request leaves the page once it is Klaar and the feedback was sent.
 */
export default async function SabineBoard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rows, questions, summaries, feedback, dances } = await loadSabineBoard();
  const groups = new Map<string, Row[]>();
  for (const row of rows) groups.set(row.couple_id, [...(groups.get(row.couple_id) ?? []), row]);
  const today = todayIso();
  const count = (n: number) => <span className="ml-2 rounded-full bg-cream-deep px-2 py-0.5 align-middle font-sans text-xs text-muted">{n}</span>;

  return (
    <div className="space-y-10">
      <header>
        <p className="eyebrow">Beheer</p>
        <h1 className="mt-1 text-3xl">Taken</h1>
        <p className="mt-1 text-sm text-muted">Alles wat op jou wacht: je taken per bruidspaar, open vragen, aanvragen voor een openingsdans, opdrachten om samen te vatten en feedback voor cursisten.</p>
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

      <section id="openingsdans" aria-labelledby="openingsdans-kop" className="scroll-mt-6 space-y-3">
        <h2 id="openingsdans-kop" className="text-2xl">Aanvragen openingsdanspakket{count(dances.length)}</h2>
        {dances.length === 0 ? (
          <p className="card p-5 text-sm text-muted">Geen open aanvragen voor een openingsdanspakket.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {dances.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <Link href={`/k/${r.couple_id}/openingsdans`} className="font-medium hover:text-bordeaux">{coupleName(r)}</Link>
                  <span className="text-muted"> · trouwdatum {r.wedding_date ? formatDate(r.wedding_date) : "onbekend"}</span>
                  <p className="mt-0.5"><strong>{r.package_name}</strong></p>
                  {r.message && <p className="mt-1 line-clamp-3 whitespace-pre-line text-muted">{r.message}</p>}
                  <p className="mt-1 text-xs text-muted">{formatDateTime(r.created_at)}{r.requested_by_name ? ` · ${r.requested_by_name}` : ""}</p>
                </div>
                <form action={markDanceRequest}>
                  <input type="hidden" name="requestId" value={r.id} />
                  <input type="hidden" name="handled" value="1" />
                  <input type="hidden" name="back" value="taken" />
                  <button type="submit" className="btn-secondary py-1 text-xs">Afgehandeld</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="samenvatten" aria-labelledby="samenvatten-kop" className="scroll-mt-6 space-y-3">
        <h2 id="samenvatten-kop" className="text-2xl">Ingeleverde opdrachten om samen te vatten{count(summaries.length)}</h2>
        {summaries.length === 0 ? (
          <p className="card p-5 text-sm text-muted">Geen ingeleverde opdrachten om samen te vatten.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {summaries.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                {/* Feedback Sabine (6): tick it off once the summary is made. */}
                <form action={markSummaryDone}>
                  <input type="hidden" name="assignmentId" value={a.id} />
                  <button
                    type="submit"
                    aria-label={`Samenvatting van ${a.title} (${coupleName(a)}) is gemaakt`}
                    title="Samenvatting gemaakt"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gold text-transparent hover:bg-gold/20 hover:text-gold-ink"
                  >
                    ✓
                  </button>
                </form>
                <Link href={`/k/${a.couple_id}/opdrachten/${a.id}`} className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-2 hover:text-bordeaux">
                  <span><span className="font-medium">{a.title}</span> <span className="text-muted">· {coupleName(a)}</span></span>
                  <span className="text-xs text-muted">Ingeleverd {formatDateTime(a.submitted_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">Alleen Thema &amp; Styling hoeft samengevat te worden. Vink een opdracht af zodra je de samenvatting hebt gemaakt.</p>
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
