import Link from "next/link";
import { AccessNotice } from "@/components/AccessNotice";
import { NewFeedbackNotice } from "@/components/academy/NewFeedbackNotice";
import { Badge } from "@/components/Badge";
import { ModuleCard } from "@/components/ModuleCard";
import { ProgressBar } from "@/components/ProgressBar";
import { nextLesson, type StudentOverview } from "@/lib/academy";
import type { Settings } from "@/lib/data";
import { remainingDays } from "@/lib/domain/access";
import { assignmentsOf, isSubmitted } from "@/lib/domain/assignment";
import { plural } from "@/lib/domain/labels";
import { COURSE_STATUS_LABELS, isUnfinished, modulePercent } from "@/lib/domain/progress";
import { formatDate } from "@/lib/util/format";
import { formatDate as wsDate } from "@/lib/ws/format";
import { draaiboekTitle } from "@/lib/ws/meekijkers-pure";

/**
 * The dashboard and "Mijn opleiding" of a student, shared by the student pages
 * and Sabine's "Bekijk als cursist" in the beheer (feedback Sabine: a preview
 * without signing in as a student). Only the links differ.
 */
export interface StudentLinks {
  lesson: (lessonId: string) => string;
  course: string;
  draaiboek: (accessId: string, coupleId: string) => string;
  certificate: string;
}

export const STUDENT_LINKS: StudentLinks = {
  lesson: (id) => `/les/${id}`,
  course: "/opleiding",
  draaiboek: (id) => `/draaiboek/${id}`,
  certificate: "/certificaat",
};

type WalkAlong = { id: string; couple: { id: string; partner1_first: string; partner2_first: string; wedding_date: string | null } }[];

export function DashboardView({
  o,
  settings,
  walkAlong,
  links = STUDENT_LINKS,
}: {
  o: StudentOverview;
  settings: Settings;
  walkAlong: WalkAlong;
  links?: StudentLinks;
}) {
  const next = nextLesson(o.progress);
  const current = o.progress.find((p) => p.state === "open") ?? o.progress.at(-1);
  const active = o.access === "active";

  return (
    <div className="space-y-10">
      {/* Feedback: the main page looked empty. A header in the colours of Estasi, with Sabine's photo when she set one. */}
      <header className="relative overflow-hidden rounded-3xl bg-bordeaux text-white shadow-sm">
        {settings.headerImageFileId && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- private course file behind /api/bestanden */}
            <img src={`/api/bestanden/${settings.headerImageFileId}`} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-bordeaux/90 via-bordeaux/60 to-bordeaux/10" aria-hidden />
          </>
        )}
        <div className="relative px-6 py-10 sm:px-10 sm:py-14">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-gold-soft uppercase">Future Weddings Academy</p>
          <h1 className="mt-2 text-4xl text-white sm:text-5xl">Welkom, {o.user.name.split(" ")[0]}</h1>
          {active && current && <p className="mt-3 max-w-xl text-[15px] text-white/85">Je bent bezig met {current.module.title}.</p>}
          {active && next && (
            <Link href={links.lesson(next.id)} className="btn-gold mt-6 inline-flex">Ga verder: {next.title}</Link>
          )}
        </div>
      </header>

      {walkAlong.length > 0 && (
        <section aria-labelledby="meeloop-titel" className="card p-6">
          <p className="eyebrow">Meeloopbruiloft</p>
          <h2 id="meeloop-titel" className="mt-1 text-2xl">Je mag meekijken in het draaiboek</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {walkAlong.map((w) => (
              <Link key={w.id} href={links.draaiboek(w.id, w.couple.id)} className="btn-primary flex-col items-start text-left">
                <span>{draaiboekTitle(w.couple)}</span>
                <span className="text-xs font-normal opacity-90">{w.couple.wedding_date ? wsDate(w.couple.wedding_date) : "Trouwdatum volgt"}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!active && <AccessNotice enrollment={o.enrollment} contactEmail={settings.contactEmail} />}
      {active && <NewFeedbackNotice userId={o.user.id} lessonHref={links.lesson} />}

      {active && o.enrollment && (
        <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="card p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              {o.status && <Badge tone={o.status === "in_progress" ? "gold" : isUnfinished(o.status) ? "neutral" : "success"}>{COURSE_STATUS_LABELS[o.status]}</Badge>}
            </div>
            {current && (
              <>
                <p className="mt-4 text-sm text-muted">Huidige module</p>
                <h2 className="text-3xl">{current.module.title}</h2>
              </>
            )}
            <div className="mt-6">
              <ProgressBar percent={o.percent} label="Totale voortgang" />
            </div>
            <p className="mt-3 text-sm text-muted">
              {o.completedModules} van {plural(o.progress.length, "module", "modules")} afgerond · {plural(o.submittedAssignments, "opdracht", "opdrachten")} ingediend
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {next ? (
                <Link href={links.lesson(next.id)} className="btn-primary">
                  Ga verder: {next.title}
                </Link>
              ) : (
                <Link href={links.course} className="btn-secondary">Bekijk je opleiding</Link>
              )}
            </div>
            {o.status === "awaiting_confirmation" && (
              <p className="mt-4 rounded-lg bg-gold-soft p-3 text-sm text-gold-ink">
                Je hebt alle lessen afgerond. Je opleider bekijkt je opdrachten en bevestigt persoonlijk je afronding.
              </p>
            )}
            {o.enrollment.certificateReleasedAt && (
              <p className="mt-4 rounded-lg bg-success-soft p-3 text-sm text-success">
                Gefeliciteerd! Je online certificaat staat klaar.{" "}
                <Link href={links.certificate} className="underline">Bekijk je certificaat</Link>
              </p>
            )}
          </div>

          <div className="card p-6">
            <p className="eyebrow">Je toegang</p>
            <p className="mt-2 font-serif text-3xl">{plural(remainingDays(o.enrollment), "dag", "dagen")}</p>
            <p className="text-sm text-muted">Geldig tot {formatDate(o.enrollment.endsAt)}</p>
            {o.openFeedback > 0 && (
              <p className="mt-4 text-sm text-muted">{o.openFeedback === 1 ? "1 opdracht wacht" : `${o.openFeedback} opdrachten wachten`} op feedback. Je kunt gewoon verder.</p>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-3xl">Modules</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {o.progress.map((p, i) => (
            <ModuleCard key={p.module.id} p={p} index={i} href={active ? `${links.course}#${p.module.id}` : undefined} />
          ))}
        </div>
      </section>
    </div>
  );
}

export function CourseView({ o, settings, links = STUDENT_LINKS }: { o: StudentOverview; settings: Settings; links?: StudentLinks }) {
  const active = o.access === "active";

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Mijn opleiding</p>
        <h1 className="mt-1 text-4xl">Je leerroute</h1>
        <div className="mt-6 max-w-md">
          <ProgressBar percent={o.percent} label="Totale voortgang" />
        </div>
        <p className="mt-3 text-sm text-muted">
          {o.completedModules} van {plural(o.progress.length, "module", "modules")} afgerond · {plural(o.submittedAssignments, "opdracht", "opdrachten")} ingediend
          {o.openFeedback > 0 && ` · ${o.openFeedback === 1 ? "1 opdracht wacht" : `${o.openFeedback} opdrachten wachten`} op feedback (je kunt gewoon verder)`}
        </p>
      </header>

      {!active && <AccessNotice enrollment={o.enrollment} contactEmail={settings.contactEmail} />}
      {active && <NewFeedbackNotice userId={o.user.id} lessonHref={links.lesson} />}

      <ol className="space-y-5">
        {o.progress.map((p, i) => (
          <li key={p.module.id} id={p.module.id} className={`card scroll-mt-24 p-6 ${p.state === "locked" ? "bg-cream/60" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Module {i + 1}</p>
                <h2 className={`mt-1 text-2xl ${p.state === "locked" ? "text-muted" : ""}`}>{p.module.title}</h2>
                <p className="mt-1 text-sm text-muted">{p.module.description}</p>
              </div>
              <div className="text-right">
                <Badge tone={p.state === "completed" ? "success" : p.state === "open" ? "gold" : "neutral"}>
                  {p.state === "completed" ? "Afgerond" : p.state === "open" ? "Beschikbaar" : "Vergrendeld"}
                </Badge>
                <p className="mt-1 text-sm text-muted">{p.completedCount}/{plural(p.lessons.length, "les", "lessen")} afgerond</p>
                {p.assignments.total > 0 && <p className="text-sm text-muted">{p.assignments.submitted}/{plural(p.assignments.total, "opdracht", "opdrachten")} ingediend</p>}
              </div>
            </div>
            {p.state !== "locked" && p.lessons.length > 0 && (
              <div className="mt-4 max-w-sm">
                <ProgressBar percent={modulePercent(p)} label="Voortgang module" />
              </div>
            )}

            {p.state === "locked" ? (
              <p className="mt-4 text-sm text-muted">Deze module komt vanzelf vrij zodra je de vorige module hebt afgerond.</p>
            ) : (
              <ul className="mt-5 divide-y divide-line border-t border-line">
                {p.lessons.map((lesson, j) => {
                  const done = p.completedLessonIds.has(lesson.id);
                  const lessonAssignments = assignmentsOf(lesson.blocks);
                  const handedIn = lessonAssignments.filter((a) => o.submissions.some((s) => s.lessonId === lesson.id && s.blockId === a.id && isSubmitted(s.status))).length;
                  const row = (
                    <>
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs ${
                          done ? "border-success bg-success text-white" : "border-gold/60 text-gold-ink"
                        }`}
                        aria-hidden
                      >
                        {done ? "✓" : j + 1}
                      </span>
                      <span className="flex-1">
                        <span className="block font-medium">{lesson.title}</span>
                        {lesson.summary && <span className="block text-sm text-muted">{lesson.summary}</span>}
                      </span>
                      <span className="text-right text-sm text-muted">
                        <span className="block">{done ? "Afgerond" : "Open"}</span>
                        {lessonAssignments.length > 0 && <span className="block text-xs">{handedIn}/{lessonAssignments.length} ingediend</span>}
                      </span>
                    </>
                  );
                  return (
                    <li key={lesson.id}>
                      {active ? (
                        <Link href={links.lesson(lesson.id)} className="flex items-center gap-4 py-3 hover:text-bordeaux">
                          {row}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-4 py-3 text-muted">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
