import Link from "next/link";
import { Notice } from "@/components/Notice";
import { markFavoritesSeen } from "@/app/actions/ws-suppliers";
import { markNoticesSeen } from "@/app/actions/ws-styling";
import { SubmitButton } from "@/components/SubmitButton";
import { listCouples } from "@/lib/ws/couples";
import { query } from "@/lib/ws/db";
import { countdownLabel, coupleName, formatDate, formatDateTime } from "@/lib/ws/format";

export const metadata = { title: "Bruidsparen" };

const STATUS = { concept: "Concept", active: "Gedeeld", archived: "Gearchiveerd" } as const;

export default async function AdminHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const showArchived = (await searchParams).archief === "1";
  const couples = await listCouples(showArchived);
  const openQuestions = couples.reduce((n, c) => n + c.open_questions, 0);
  const openTasks = couples.reduce((n, c) => n + c.open_sabine_tasks, 0);
  const favorites = await query<{ id: string; couple_id: string; p1: string; p2: string; rec: string | null; category: string | null; created_at: Date }>(
    `select e.id, e.couple_id, c.partner1_first as p1, c.partner2_first as p2, r.name as rec, sc.name as category, e.created_at
       from favorite_events e join couples c on c.id = e.couple_id
       left join recommendations r on r.id = e.recommendation_id
       left join supplier_categories sc on sc.id = r.category_id
      where e.seen_at is null order by e.created_at desc limit 30`,
  );
  const notices = await query<{ id: string; text: string; link: string; created_at: Date }>(
    "select id, text, link, created_at from admin_notices where seen_at is null order by created_at desc limit 30",
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Beheer</p>
          <h1 className="mt-1 text-3xl">Bruidsparen</h1>
        </div>
        <Link href="/beheer/bruidsparen/nieuw" className="btn-primary">Nieuw bruidspaar</Link>
      </header>
      <Notice searchParams={searchParams} />

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-sm text-muted">Actieve bruidsparen</p><p className="font-serif text-3xl">{couples.filter((c) => c.status === "active").length}</p></div>
        <Link href="/beheer/bruidsparen/takenbord" className="card p-4 hover:shadow-md"><p className="text-sm text-muted">Mijn open taken</p><p className={`font-serif text-3xl ${openTasks ? "text-bordeaux" : ""}`}>{openTasks}</p></Link>
        <div className="card p-4"><p className="text-sm text-muted">Onbeantwoorde vragen</p><p className={`font-serif text-3xl ${openQuestions ? "text-bordeaux" : ""}`}>{openQuestions}</p></div>
      </section>

      {notices.length > 0 && (
        <section className="card border border-success/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg">Meldingen</h2>
            <form action={markNoticesSeen}><SubmitButton className="btn-ghost py-1 text-xs">Gezien</SubmitButton></form>
          </div>
          <ul className="mt-2 divide-y divide-line text-sm">
            {notices.map((n) => (
              <li key={n.id} className="flex flex-wrap justify-between gap-2 py-2">
                <Link href={n.link || "#"} className="hover:text-bordeaux">{n.text}</Link>
                <span className="text-xs text-muted">{formatDateTime(n.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {favorites.length > 0 && (
        <section className="card border border-bordeaux/30 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg">♥ Nieuwe favorieten bij de aanraders</h2>
            <form action={markFavoritesSeen}><SubmitButton className="btn-ghost py-1 text-xs">Gezien</SubmitButton></form>
          </div>
          <ul className="mt-2 divide-y divide-line text-sm">
            {favorites.map((f) => (
              <li key={f.id} className="flex flex-wrap justify-between gap-2 py-2">
                <Link href={`/k/${f.couple_id}/leveranciers`} className="hover:text-bordeaux">
                  <strong>{coupleName({ partner1_first: f.p1, partner2_first: f.p2 })}</strong>: {f.rec ?? "verwijderde aanrader"}{f.category ? ` (${f.category})` : ""}
                </Link>
                <span className="text-xs text-muted">{formatDateTime(f.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="table-head">
            <tr><th className="px-4 py-2.5">Bruidspaar</th><th className="px-4 py-2.5">Trouwdatum</th><th className="px-4 py-2.5">Pakket</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Open</th><th className="px-4 py-2.5">Laatst actief</th></tr>
          </thead>
          <tbody>
            {couples.map((c) => (
              <tr key={c.id} className="border-t border-line hover:bg-cream/50">
                <td className="px-4 py-3">
                  <Link href={`/k/${c.id}`} className="font-medium hover:text-bordeaux">{coupleName(c)}</Link>
                  {c.location && <p className="text-xs text-muted">{c.location}</p>}
                </td>
                <td className="px-4 py-3">
                  {formatDate(c.wedding_date)}
                  {c.wedding_date && countdownLabel(c.wedding_date) && <p className="text-xs text-muted">over {countdownLabel(c.wedding_date)}</p>}
                </td>
                <td className="px-4 py-3">{c.package_name ?? "–"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${c.status === "active" ? "bg-success-soft text-success" : "bg-cream text-gold-ink"}`}>{STATUS[c.status]}</span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {c.open_questions > 0 && <span className="mr-2 rounded-full bg-bordeaux-soft px-2 py-0.5 text-bordeaux">{c.open_questions} vraag{c.open_questions === 1 ? "" : "en"}</span>}
                  {c.open_sabine_tasks > 0 && <span className="text-muted">{c.open_sabine_tasks} taken</span>}
                </td>
                <td className="px-4 py-3 text-muted">{c.last_activity ? formatDateTime(c.last_activity) : "–"}</td>
              </tr>
            ))}
            {couples.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">Nog geen bruidsparen. Begin met &quot;Nieuw bruidspaar&quot;.</td></tr>}
          </tbody>
        </table>
      </div>
      <Link href={showArchived ? "/beheer/bruidsparen" : "/beheer/bruidsparen?archief=1"} className="text-sm text-muted hover:text-bordeaux">
        {showArchived ? "Gearchiveerde bruidsparen verbergen" : "Ook gearchiveerde bruidsparen tonen"}
      </Link>
    </div>
  );
}
