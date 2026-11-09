import Link from "next/link";
import { changeAccess } from "@/app/actions/admin";
import { Badge } from "@/components/Badge";
import { Notice } from "@/components/Notice";
import { ProgressBar } from "@/components/ProgressBar";
import { SubmitButton } from "@/components/SubmitButton";
import { studentOverview } from "@/lib/academy";
import { getStore } from "@/lib/data";
import { ACCESS_LABELS, DEFAULT_EXTEND_MONTHS, EXTEND_MONTHS } from "@/lib/domain/access";
import { BANNER_DAYS, daysLeft, daysLeftText } from "@/lib/domain/expiry";
import { PACKAGE_LABELS, plural } from "@/lib/domain/labels";
import { COURSE_STATUS_LABELS, isUnfinished } from "@/lib/domain/progress";
import { formatDate, formatDateTime } from "@/lib/util/format";

export const metadata = { title: "Cursisten" };

const ACCESS_TONE = { active: "success", paused: "gold", expired: "neutral", revoked: "bordeaux", none: "neutral" } as const;

export default async function OwnerHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const students = await getStore().listUsers("student");
  const overviews = await Promise.all(students.map(studentOverview));
  overviews.sort((a, b) => (b.user.lastActiveAt ?? "").localeCompare(a.user.lastActiveAt ?? ""));

  const waiting = overviews.filter((o) => o.status === "awaiting_confirmation").length;
  const feedback = overviews.reduce((n, o) => n + o.openFeedback, 0);
  const active = overviews.filter((o) => o.access === "active").length;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Beheer</p>
          <h1 className="mt-1 text-4xl">Cursisten</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/beheer/feedback" className="btn-secondary">Feedback</Link>
          <Link href="/beheer/cursisten/nieuw" className="btn-primary">Cursist toevoegen</Link>
        </div>
      </header>
      <Notice searchParams={searchParams} />

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Actieve cursisten" value={active} />
        <Stat label="Wachten op bevestiging" value={waiting} highlight={waiting > 0} />
        <Stat label="Openstaande feedback" value={feedback} highlight={feedback > 0} href="/beheer/feedback" />
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line bg-cream/60 text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Cursist</th>
                <th className="px-4 py-3 font-medium">Pakket en start</th>
                <th className="px-4 py-3 font-medium">Toegang en einddatum</th>
                <th className="px-4 py-3 font-medium">Voortgang</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Feedback</th>
                <th className="px-4 py-3 font-medium">Laatst actief</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {overviews.map((o) => (
                <tr key={o.user.id} className="hover:bg-cream/40">
                  <td className="px-4 py-3">
                    <Link href={`/beheer/cursisten/${o.user.id}`} className="font-medium text-ink hover:text-bordeaux">{o.user.name}</Link>
                    <p className="text-xs text-muted">{o.user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {o.enrollment ? `${o.enrollment.package} · ${PACKAGE_LABELS[o.enrollment.package]}` : "–"}
                    <p className="text-xs text-muted">{formatDate(o.enrollment?.purchasedAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={ACCESS_TONE[o.access]}>{o.access === "none" ? "Geen" : ACCESS_LABELS[o.access]}</Badge>
                    <p className="mt-1 text-xs text-muted">Einddatum {formatDate(o.enrollment?.endsAt)}</p>
                    <ExpiresSoon days={daysLeft(o.enrollment)} />
                    {o.access === "expired" && (
                      <form action={changeAccess} className="mt-2 flex items-center gap-1">
                        <input type="hidden" name="userId" value={o.user.id} />
                        <input type="hidden" name="op" value="extend" />
                        <input type="hidden" name="returnTo" value="overzicht" />
                        <label className="sr-only" htmlFor={`months-${o.user.id}`}>Aantal maanden</label>
                        <select id={`months-${o.user.id}`} name="months" defaultValue={DEFAULT_EXTEND_MONTHS} className="input w-auto px-2 py-1 text-xs">
                          {EXTEND_MONTHS.map((m) => (
                            <option key={m} value={m}>{plural(m, "maand", "maanden")}</option>
                          ))}
                        </select>
                        <SubmitButton className="btn-secondary px-2 py-1 text-xs" pendingText="…">Verlengen</SubmitButton>
                      </form>
                    )}
                  </td>
                  <td className="w-40 px-4 py-3">
                    <ProgressBar percent={o.percent} />
                    <p className="mt-1 text-xs text-muted">{o.percent}% · {plural(o.submittedAssignments, "opdracht", "opdrachten")} ingediend</p>
                  </td>
                  <td className="px-4 py-3">
                    {o.status ? (isUnfinished(o.status) ? <Badge tone="bordeaux">{COURSE_STATUS_LABELS[o.status]}</Badge> : COURSE_STATUS_LABELS[o.status]) : "–"}
                  </td>
                  <td className="px-4 py-3">{o.openFeedback > 0 ? <Badge tone="bordeaux">{o.openFeedback} open</Badge> : <span className="text-muted">–</span>}</td>
                  <td className="px-4 py-3 text-muted">{o.user.lastActiveAt ? formatDateTime(o.user.lastActiveAt) : "Nog niet"}</td>
                </tr>
              ))}
              {overviews.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">Nog geen cursisten.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, highlight = false, href }: { label: string; value: number; highlight?: boolean; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 font-serif text-4xl ${highlight ? "text-bordeaux" : ""}`}>{value}</p>
    </>
  );
  const className = `card p-5 ${highlight ? "border-bordeaux/30" : ""}`;
  return href ? (
    <Link href={href} className={`${className} block transition-colors hover:border-bordeaux/40`}>{body}</Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function ExpiresSoon({ days }: { days: number | null }) {
  if (days === null || days > BANNER_DAYS) return null;
  return <p className="mt-1 text-xs font-medium text-bordeaux">Verloopt binnenkort: {daysLeftText(days)}</p>;
}
