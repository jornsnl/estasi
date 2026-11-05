import Link from "next/link";
import { addAgendaItem } from "@/app/actions/admin";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { query } from "@/lib/db";
import { listCouples } from "@/lib/data/couples";
import { coupleName, formatDate, todayIso } from "@/lib/domain/format";

export const metadata = { title: "Mijn agenda" };

interface Row {
  id: string;
  kind: "appointment" | "deadline";
  title: string;
  on_date: string;
  at_time: string;
  with_sabine: boolean;
  couple_id: string;
  partner1_first: string;
  partner2_first: string;
}

/** Appointments and deadlines of every couple in one agenda (h9.5). */
export default async function Agenda({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const showAll = (await searchParams).alles === "1";
  const today = todayIso();
  const [rows, couples] = await Promise.all([
    query<Row>(
      `select a.id, a.kind, a.title, a.on_date, a.at_time, a.with_sabine, c.id as couple_id, c.partner1_first, c.partner2_first
         from appointments a join couples c on c.id = a.couple_id
        where a.on_date >= $1 and c.status <> 'archived' and ($2 or a.with_sabine or a.kind = 'deadline')
        order by a.on_date, a.at_time`,
      [today, showAll],
    ),
    listCouples(),
  ]);
  const months = new Map<string, Row[]>();
  for (const row of rows) {
    const key = row.on_date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), row]);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Beheer</p>
        <h1 className="mt-1 text-3xl">Mijn agenda</h1>
        <p className="mt-1 text-sm text-muted">
          {showAll ? "Alle komende afspraken en deadlines van alle bruidsparen." : "Komende afspraken met jou en alle deadlines van alle bruidsparen."}{" "}
          <Link href={showAll ? "/beheer/agenda" : "/beheer/agenda?alles=1"} className="text-bordeaux hover:underline">
            {showAll ? "Alleen mijn afspraken en deadlines" : "Ook afspraken van bruidsparen met leveranciers tonen"}
          </Link>
        </p>
      </header>
      <Notice searchParams={searchParams} />

      {months.size === 0 && <p className="card p-6 text-muted">Niets gepland.</p>}
      {[...months.entries()].map(([month, items]) => (
        <section key={month}>
          <h2 className="section-title mb-2 capitalize">{new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" }).format(new Date(`${month}-15T12:00:00Z`))}</h2>
          <ul className="card divide-y divide-line">
            {items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 p-4 text-sm">
                <span className="w-36 shrink-0 font-medium">{formatDate(a.on_date, false)}{a.at_time ? ` · ${a.at_time}` : ""}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${a.kind === "deadline" ? "bg-bordeaux-soft text-bordeaux" : "bg-cream text-gold-ink"}`}>{a.kind === "deadline" ? "Deadline" : "Afspraak"}</span>
                <span className="flex-1">{a.title}</span>
                <Link href={`/k/${a.couple_id}/afspraken`} className="text-muted hover:text-bordeaux">{coupleName(a)}</Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <form action={addAgendaItem} className="card grid gap-3 p-5 sm:grid-cols-6">
        <h2 className="text-lg sm:col-span-6">Afspraak toevoegen</h2>
        <div className="sm:col-span-3">
          <label className="label" htmlFor="coupleId">Bruidspaar</label>
          <select id="coupleId" name="coupleId" required className="input">
            {couples.map((c) => <option key={c.id} value={c.id}>{coupleName(c)}</option>)}
          </select>
        </div>
        <div className="sm:col-span-3">
          <label className="label" htmlFor="kind">Type</label>
          <select id="kind" name="kind" className="input"><option value="appointment">Afspraak met mij</option><option value="deadline">Deadline</option></select>
        </div>
        <div className="sm:col-span-2"><label className="label" htmlFor="onDate">Datum</label><input id="onDate" name="onDate" type="date" required className="input" /></div>
        <div className="sm:col-span-1"><label className="label" htmlFor="atTime">Tijd</label><input id="atTime" name="atTime" type="time" className="input" /></div>
        <div className="sm:col-span-3"><label className="label" htmlFor="title">Wat</label><input id="title" name="title" required className="input" placeholder="Bijvoorbeeld: Meeting 2" /></div>
        <div className="sm:col-span-6"><SubmitButton className="btn-primary">Toevoegen</SubmitButton></div>
      </form>
    </div>
  );
}
