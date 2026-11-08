import Link from "next/link";
import { Badge } from "@/components/Badge";
import type { StudentOverview } from "@/lib/academy";
import type { AssignmentFeedback, Lesson } from "@/lib/data/types";
import { assignmentTitle, isSubmitted, STATUS_LABELS } from "@/lib/domain/assignment";
import { daysLeft, daysLeftText, BANNER_DAYS } from "@/lib/domain/expiry";
import { PACKAGE_LABELS, plural } from "@/lib/domain/labels";
import { formatDate, formatDateTime } from "@/lib/util/format";

/**
 * Academy 13: everything about one student at a glance (package, start and
 * end, progress, handed in assignments, open feedback requests, feedback
 * given, portfolio). The lists link to the lesson on the student page; the
 * feedback screens themselves are elsewhere.
 */
export function StudentAdminSummary({ overview: o, lessons, feedback }: { overview: StudentOverview; lessons: Lesson[]; feedback: AssignmentFeedback[] }) {
  const e = o.enrollment;
  const userId = o.user.id;
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const subById = new Map(o.submissions.map((s) => [s.id, s]));
  const lessonLink = (lessonId: string | undefined) => `/beheer/cursisten/${userId}${lessonId ? `?les=${lessonId}` : ""}`;
  const lessonTitle = (lessonId: string | undefined) => (lessonId && lessonById.get(lessonId)?.title) || "Verwijderde les";

  const versions = o.versions.slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const latestBySub = new Map<string, (typeof versions)[number]>();
  for (const v of versions) if (!latestBySub.has(v.submissionId)) latestBySub.set(v.submissionId, v);
  const handedIn = o.submissions
    .filter((s) => isSubmitted(s.status))
    .map((s) => ({ s, v: latestBySub.get(s.id) }))
    .sort((a, b) => (b.s.submittedAt ?? "").localeCompare(a.s.submittedAt ?? ""));
  const open = versions.filter((v) => v.feedbackStatus === "nieuw" || v.feedbackStatus === "in_behandeling");
  const given = feedback.filter((f) => f.sentAt).sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""));
  const versionById = new Map(o.versions.map((v) => [v.id, v]));
  const left = daysLeft(e);

  return (
    <section className="card p-6" aria-labelledby="beheer-overzicht">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="beheer-overzicht" className="text-2xl">Overzicht</h2>
        <Link href={`/beheer/cursisten/${userId}/portfolio`} className="btn-secondary">Portfolio bekijken</Link>
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Item label="Pakket">{e ? `${e.package} · ${PACKAGE_LABELS[e.package]}` : "Geen inschrijving"}</Item>
        <Item label="Startdatum (aankoop)">{formatDate(e?.purchasedAt)}</Item>
        <Item label="Einddatum toegang">
          {formatDate(e?.endsAt)}
          {left !== null && left <= BANNER_DAYS && <span className="ml-2"><Badge tone="bordeaux">{daysLeftText(left)}</Badge></span>}
        </Item>
        <Item label="Studievoortgang">
          {o.percent}% · {o.completedModules} van {plural(o.progress.length, "module", "modules")} afgerond
        </Item>
        <Item label="Ingeleverde opdrachten">{o.submittedAssignments}</Item>
        <Item label="Openstaande feedbackverzoeken">{open.length > 0 ? <Badge tone="bordeaux">{open.length} open</Badge> : "Geen"}</Item>
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <List title="Openstaande feedbackverzoeken" empty="Geen openstaande verzoeken.">
          {open.map((v) => {
            const s = subById.get(v.submissionId);
            return (
              <li key={v.id}>
                <Link href={`/beheer/feedback/${v.id}`} className="font-medium text-bordeaux hover:underline">{assignmentTitle(v.assignment)}</Link>
                <p className="text-xs text-muted">
                  {lessonTitle(s?.lessonId)} · versie {v.version} · {formatDateTime(v.submittedAt)} · {v.feedbackStatus === "nieuw" ? "nieuw" : "in behandeling"}
                </p>
              </li>
            );
          })}
        </List>
        <List title="Eerder gegeven feedback" empty="Nog geen feedback gegeven.">
          {given.map((f) => {
            const v = versionById.get(f.versionId);
            const s = subById.get(f.submissionId);
            return (
              <li key={f.id}>
                <Link href={v ? `/beheer/feedback/${v.id}` : lessonLink(s?.lessonId)} className="font-medium text-bordeaux hover:underline">{v ? assignmentTitle(v.assignment) : "Opdracht"}</Link>
                <p className="text-xs text-muted">
                  {lessonTitle(s?.lessonId)}{v ? ` · versie ${v.version}` : ""} · verstuurd {formatDateTime(f.sentAt)}
                </p>
              </li>
            );
          })}
        </List>
        <List title="Ingeleverde opdrachten" empty="Nog niets ingeleverd.">
          {handedIn.map(({ s, v }) => (
            <li key={s.id}>
              <Link href={v ? `/beheer/feedback/${v.id}` : lessonLink(s.lessonId)} className="font-medium text-bordeaux hover:underline">{v ? assignmentTitle(v.assignment) : "Opdracht"}</Link>
              <p className="text-xs text-muted">
                {lessonTitle(s.lessonId)} · {STATUS_LABELS[s.status].toLowerCase()} · {formatDate(s.submittedAt)}
                {v && v.version > 1 ? ` · ${v.version} versies` : ""}
              </p>
            </li>
          ))}
        </List>
      </div>
    </section>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function List({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div>
      <h3 className="text-base font-semibold">{title}</h3>
      {children.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1 text-sm">{children}</ul>
      )}
    </div>
  );
}
