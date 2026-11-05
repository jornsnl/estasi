import Link from "next/link";
import { toggleTask } from "@/app/actions/ws-portal";
import { SubmitButton } from "@/components/SubmitButton";
import { requireCouple } from "@/lib/ws/access";
import { query } from "@/lib/ws/db";
import { formatDate, formatDateTime, LANE_LABELS } from "@/lib/ws/format";
import type { Question, Task } from "@/lib/ws/types";

export const metadata = { title: "Geschiedenis" };

export default async function History({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple } = await requireCouple(coupleId);
  const base = `/k/${couple.id}`;
  const showQuestions = (await searchParams).soort === "vragen";

  const tasks = showQuestions
    ? []
    : await query<Task & { done_by_name: string | null }>(
        `select t.* from tasks t
          where t.couple_id = $1 and t.done_at is not null order by t.done_at desc`,
        [couple.id],
      );
  const questions = showQuestions
    ? await query<Question>(
        `select q.* from questions q
          where q.couple_id = $1 and q.answered_at is not null order by q.answered_at desc`,
        [couple.id],
      )
    : [];

  return (
    <div className="space-y-6">
      <div>
        <Link href={`${base}#${showQuestions ? "vragenblok" : "takenlijst"}`} className="text-sm text-muted hover:text-bordeaux">← Terug naar het overzicht</Link>
        <h1 className="mt-2 text-3xl">Geschiedenis</h1>
        <div className="mt-3 flex gap-2 text-sm">
          <Link href={`${base}/geschiedenis?soort=taken`} className={`rounded-full px-3 py-1 ${!showQuestions ? "bg-bordeaux text-white" : "bg-white"}`}>Afgeronde taken</Link>
          <Link href={`${base}/geschiedenis?soort=vragen`} className={`rounded-full px-3 py-1 ${showQuestions ? "bg-bordeaux text-white" : "bg-white"}`}>Beantwoorde vragen</Link>
        </div>
      </div>

      {!showQuestions && (
        <ul className="card divide-y divide-line">
          {tasks.length === 0 && <li className="p-5 text-sm text-muted">Nog geen afgeronde taken.</li>}
          {tasks.map((task) => (
            <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div>
                <p className="line-through decoration-gold/60">{task.title}</p>
                <p className="text-xs text-muted">
                  {LANE_LABELS[task.lane]} · afgevinkt {formatDateTime(task.done_at)}{task.done_by_name ? ` door ${task.done_by_name}` : ""}
                  {task.deadline ? ` · deadline was ${formatDate(task.deadline)}` : ""}
                </p>
              </div>
              <form action={toggleTask}>
                <input type="hidden" name="coupleId" value={couple.id} />
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="back" value={`${base}/geschiedenis?soort=taken`} />
                <SubmitButton className="btn-ghost py-1 text-xs">Weer openzetten</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}

      {showQuestions && (
        <div className="space-y-3">
          {questions.length === 0 && <p className="card p-5 text-sm text-muted">Nog geen beantwoorde vragen.</p>}
          {questions.map((q) => (
            <article key={q.id} className="card p-5 text-sm">
              <p className="whitespace-pre-line">{q.body}</p>
              <p className="mt-1 text-xs text-muted">{q.asked_by_name || "Onbekend"} · {formatDateTime(q.asked_at)}</p>
              <div className="mt-3 rounded-xl bg-cream p-4">
                <p className="eyebrow mb-1">Antwoord van Sabine · {formatDateTime(q.answered_at)}</p>
                <p className="whitespace-pre-line">{q.answer}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
