import Link from "next/link";
import { AccessNotice } from "@/components/AccessNotice";
import { NewFeedbackNotice } from "@/components/academy/NewFeedbackNotice";
import { Badge } from "@/components/Badge";
import { ModuleCard } from "@/components/ModuleCard";
import { ProgressBar } from "@/components/ProgressBar";
import { VideoEmbed } from "@/components/VideoEmbed";
import { nextLesson, studentOverview } from "@/lib/academy";
import { requireStudent } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { remainingDays } from "@/lib/domain/access";
import { plural } from "@/lib/domain/labels";
import { COURSE_STATUS_LABELS, isUnfinished } from "@/lib/domain/progress";
import { formatDate } from "@/lib/util/format";
import { formatDate as wsDate } from "@/lib/ws/format";
import { viewableForStudent } from "@/lib/ws/meekijkers";
import { draaiboekTitle } from "@/lib/ws/meekijkers-pure";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const user = await requireStudent();
  const [o, settings, walkAlong] = await Promise.all([studentOverview(user), getStore().getSettings(), viewableForStudent(user.id)]);
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
          <h1 className="mt-2 text-4xl text-white sm:text-5xl">Welkom, {user.name.split(" ")[0]}</h1>
          {active && current && <p className="mt-3 max-w-xl text-[15px] text-white/85">Je bent bezig met {current.module.title}.</p>}
          {active && next && (
            <Link href={`/les/${next.id}`} className="btn-gold mt-6 inline-flex">Ga verder: {next.title}</Link>
          )}
        </div>
      </header>

      {/* The welcome message, set in Instellingen; the welcome video next to it when there is one. */}
      {(settings.welcomeText || settings.welcomeVideoUrl) && (
        <section aria-labelledby="welkom-titel" className={`card p-6 sm:p-8 ${settings.welcomeVideoUrl ? "grid gap-6 lg:grid-cols-[1.4fr_1fr]" : ""}`}>
          {settings.welcomeVideoUrl && <VideoEmbed url={settings.welcomeVideoUrl} title="Welkomstvideo" />}
          <div className="self-center">
            <h2 id="welkom-titel" className="text-2xl">{settings.welcomeTitle || "Een persoonlijk welkom"}</h2>
            {settings.welcomeText && <p className="mt-2 whitespace-pre-line text-muted">{settings.welcomeText}</p>}
          </div>
        </section>
      )}

      {walkAlong.length > 0 && (
        <section aria-labelledby="meeloop-titel" className="card p-6">
          <p className="eyebrow">Meeloopbruiloft</p>
          <h2 id="meeloop-titel" className="mt-1 text-2xl">Je mag meekijken in het draaiboek</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {walkAlong.map((w) => (
              <Link key={w.id} href={`/draaiboek/${w.id}`} className="btn-primary flex-col items-start text-left">
                <span>{draaiboekTitle(w.couple)}</span>
                <span className="text-xs font-normal opacity-90">{w.couple.wedding_date ? wsDate(w.couple.wedding_date) : "Trouwdatum volgt"}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!active && <AccessNotice enrollment={o.enrollment} contactEmail={settings.contactEmail} />}
      {active && <NewFeedbackNotice userId={user.id} />}

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
                <Link href={`/les/${next.id}`} className="btn-primary">
                  Ga verder: {next.title}
                </Link>
              ) : (
                <Link href="/opleiding" className="btn-secondary">Bekijk je opleiding</Link>
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
                <Link href="/certificaat" className="underline">Bekijk je certificaat</Link>
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
            <ModuleCard key={p.module.id} p={p} index={i} href={active ? `/opleiding#${p.module.id}` : undefined} />
          ))}
        </div>
      </section>
    </div>
  );
}
