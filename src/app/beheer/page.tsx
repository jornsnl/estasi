import Link from "next/link";
import { Badge } from "@/components/Badge";
import { Notice } from "@/components/Notice";
import { ProgressBar } from "@/components/ProgressBar";
import { studentOverview } from "@/lib/academy";
import { getStore } from "@/lib/data";
import { ACCESS_LABELS } from "@/lib/domain/access";
import { COURSE_STATUS_LABELS } from "@/lib/domain/progress";
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
        <Link href="/beheer/cursisten/nieuw" className="btn-primary">Cursist toevoegen</Link>
      </header>
      <Notice searchParams={searchParams} />

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Actieve cursisten" value={active} />
        <Stat label="Wachten op bevestiging" value={waiting} highlight={waiting > 0} />
        <Stat label="Openstaande feedback" value={feedback} highlight={feedback > 0} />
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line bg-cream/60 text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Cursist</th>
                <th className="px-4 py-3 font-medium">Pakket</th>
                <th className="px-4 py-3 font-medium">Toegang</th>
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
                    {o.enrollment ? (o.enrollment.package === "A" ? "A · Online" : "B · Praktijk") : "–"}
                    <p className="text-xs text-muted">{formatDate(o.enrollment?.purchasedAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={ACCESS_TONE[o.access]}>{o.access === "none" ? "Geen" : ACCESS_LABELS[o.access]}</Badge>
                    <p className="mt-1 text-xs text-muted">t/m {formatDate(o.enrollment?.endsAt)}</p>
                  </td>
                  <td className="w-40 px-4 py-3">
                    <ProgressBar percent={o.percent} />
                    <p className="mt-1 text-xs text-muted">{o.percent}%</p>
                  </td>
                  <td className="px-4 py-3">{o.status ? COURSE_STATUS_LABELS[o.status] : "–"}</td>
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

function Stat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`card p-5 ${highlight ? "border-bordeaux/30" : ""}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 font-serif text-4xl ${highlight ? "text-bordeaux" : ""}`}>{value}</p>
    </div>
  );
}
