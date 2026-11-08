import Link from "next/link";
import { AccessNotice } from "@/components/AccessNotice";
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
      <header>
        <p className="eyebrow">Wedding Plan Academy</p>
        <h1 className="mt-1 text-4xl sm:text-5xl">Welkom, {user.name.split(" ")[0]}</h1>
      </header>

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

      {settings.welcomeVideoUrl && (
        <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <VideoEmbed url={settings.welcomeVideoUrl} title="Welkomstvideo" />
          <div className="self-center">
            <h2 className="text-2xl">Een persoonlijk welkom</h2>
            <p className="mt-2 text-muted">{settings.welcomeText}</p>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-3xl">Modules</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {o.progress.map((p, i) => (
            <ModuleCard key={p.module.id} p={p} index={i} href={active ? `/opleiding#${p.module.id}` : undefined} />
          ))}
        </div>
      </section>
    </div>
  );
}
