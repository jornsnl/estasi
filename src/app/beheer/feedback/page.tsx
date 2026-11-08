import Link from "next/link";
import { FeedbackStatusBadge } from "@/components/academy/FeedbackStatusBadge";
import { Badge } from "@/components/Badge";
import { Notice } from "@/components/Notice";
import { getStore } from "@/lib/data";
import { listFeedbackRequests } from "@/lib/data/assignments";
import { assignmentTitle, filesIn, STATUS_LABELS } from "@/lib/domain/assignment";
import { FEEDBACK_STATUS_LABELS, FEEDBACK_STATUSES, isOpenFeedback, matchesRequest, parseRequestFilter, type RequestFilter } from "@/lib/domain/feedback";
import { formatDateTime } from "@/lib/util/format";

export const metadata = { title: "Feedback" };

const TABS: { value: RequestFilter["status"]; label: string }[] = [
  { value: "open", label: "Open" },
  ...FEEDBACK_STATUSES.map((s) => ({ value: s, label: FEEDBACK_STATUS_LABELS[s] })),
  { value: "alle", label: "Alle" },
];

/** Academy 9: every feedback request (and every final assignment that waits for an assessment) in one place. */
export default async function FeedbackOverview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const filter = parseRequestFilter(params);
  const [requests, modules] = await Promise.all([listFeedbackRequests(), getStore().listModules()]);
  const shown = requests.filter((r) => matchesRequest(r, filter));
  // Open ones oldest first (who waits longest comes first); the rest newest first.
  if (filter.status === "open" || filter.status === "nieuw" || filter.status === "in_behandeling") shown.reverse();

  const students = [...new Map(requests.map((r) => [r.userId, r.studentName])).entries()].sort((a, b) => a[1].localeCompare(b[1], "nl"));
  const count = (status: RequestFilter["status"]) => requests.filter((r) => matchesRequest(r, { ...filter, status })).length;
  const href = (patch: Partial<Record<"status" | "cursist" | "module", string>>) => {
    const q = new URLSearchParams();
    const next = { status: filter.status, cursist: filter.userId ?? "", module: filter.moduleId ?? "", ...patch };
    if (next.status && next.status !== "open") q.set("status", next.status);
    if (next.cursist) q.set("cursist", next.cursist);
    if (next.module) q.set("module", next.module);
    const s = q.toString();
    return `/beheer/feedback${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Academy</p>
        <h1 className="mt-1 text-4xl">Feedback</h1>
        <p className="mt-2 text-sm text-muted">
          Alle feedbackverzoeken van cursisten, en ingeleverde eindopdrachten die op jouw beoordeling wachten. Cursisten kunnen gewoon verder
          terwijl een verzoek openstaat.
        </p>
      </header>
      <Notice searchParams={searchParams} />

      <nav aria-label="Status" className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = filter.status === t.value;
          return (
            <Link
              key={t.value}
              href={href({ status: t.value })}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3 py-1.5 text-sm ${active ? "border-bordeaux bg-bordeaux text-white" : "border-line bg-white text-ink hover:border-bordeaux/40"}`}
            >
              {t.label} <span className={active ? "text-white/80" : "text-muted"}>({count(t.value)})</span>
            </Link>
          );
        })}
      </nav>

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        {filter.status !== "open" && <input type="hidden" name="status" value={filter.status} />}
        <div>
          <label htmlFor="f-cursist" className="label">Cursist</label>
          <select id="f-cursist" name="cursist" defaultValue={filter.userId ?? ""} className="input w-56">
            <option value="">Alle cursisten</option>
            {students.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-module" className="label">Module</label>
          <select id="f-module" name="module" defaultValue={filter.moduleId ?? ""} className="input w-64">
            <option value="">Alle modules</option>
            {modules.map((m, i) => (
              <option key={m.id} value={m.id}>{i + 1}. {m.title}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filteren</button>
        {(filter.userId || filter.moduleId) && <Link href={href({ cursist: "", module: "" })} className="btn-ghost">Wis filters</Link>}
      </form>

      <ul className="space-y-3">
        {shown.map((r) => {
          const files = filesIn(r.answers).length;
          return (
            <li key={r.versionId}>
              <Link href={`/beheer/feedback/${r.versionId}`} className={`card block p-4 transition-colors hover:border-bordeaux/40 sm:p-5 ${isOpenFeedback(r.feedbackStatus) ? "" : "opacity-90"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{r.studentName}</p>
                    <p className="text-sm text-muted">
                      {r.moduleTitle ? `Module ${modules.findIndex((m) => m.id === r.moduleId) + 1}: ${r.moduleTitle}` : "Module onbekend"} · {r.lessonTitle ?? "(les verwijderd)"}
                    </p>
                    <p className="mt-1 font-serif text-lg">{assignmentTitle(r.assignment)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {r.assignment.graded && <Badge tone="gold">Eindopdracht · {STATUS_LABELS[r.submissionStatus]}</Badge>}
                    {r.hasConcept && <Badge>Concept klaar</Badge>}
                    <FeedbackStatusBadge status={r.feedbackStatus} />
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted">
                  Versie {r.version} · ingediend {formatDateTime(r.submittedAt)}
                  {r.feedbackRequested ? " · feedback gevraagd" : " · wacht op beoordeling"}
                  {files > 0 && ` · ${files} ${files === 1 ? "bestand" : "bestanden"}`}
                  {r.lastSentAt && ` · feedback verstuurd ${formatDateTime(r.lastSentAt)}`}
                </p>
                {r.questionForSabine && <p className="mt-2 line-clamp-2 rounded-md bg-gold-soft/60 px-3 py-2 text-sm">Vraag: {r.questionForSabine}</p>}
              </Link>
            </li>
          );
        })}
        {shown.length === 0 && <li className="card p-8 text-center text-sm text-muted">Geen feedbackverzoeken met deze filters.</li>}
      </ul>
    </div>
  );
}
