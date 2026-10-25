import Link from "next/link";
import { AccessNotice } from "@/components/AccessNotice";
import { Badge } from "@/components/Badge";
import { ProgressBar } from "@/components/ProgressBar";
import { studentOverview } from "@/lib/academy";
import { requireStudent } from "@/lib/auth/session";
import { getStore } from "@/lib/data";

export const metadata = { title: "Mijn opleiding" };

export default async function CoursePage() {
  const user = await requireStudent();
  const [o, settings] = await Promise.all([studentOverview(user), getStore().getSettings()]);
  const active = o.access === "active";

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Mijn opleiding</p>
        <h1 className="mt-1 text-4xl">Je leerroute</h1>
        <div className="mt-6 max-w-md">
          <ProgressBar percent={o.percent} label="Totale voortgang" />
        </div>
      </header>

      {!active && <AccessNotice enrollment={o.enrollment} contactEmail={settings.contactEmail} />}

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
                <p className="mt-1 text-sm text-muted">{p.completedCount}/{p.lessons.length} lessen</p>
              </div>
            </div>

            {p.state === "locked" ? (
              <p className="mt-4 text-sm text-muted">Deze module komt vrij zodra je de vorige module hebt afgerond.</p>
            ) : (
              <ul className="mt-5 divide-y divide-line border-t border-line">
                {p.lessons.map((lesson, j) => {
                  const done = p.completedLessonIds.has(lesson.id);
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
                      <span className="text-sm text-muted">{done ? "Afgerond" : ""}</span>
                    </>
                  );
                  return (
                    <li key={lesson.id}>
                      {active ? (
                        <Link href={`/les/${lesson.id}`} className="flex items-center gap-4 py-3 hover:text-bordeaux">
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
