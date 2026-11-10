import Link from "next/link";
import { addAgendaItem } from "@/app/actions/ws-admin";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { query } from "@/lib/ws/db";
import { listCouples } from "@/lib/ws/couples";
import { gridRange, monthGrid, monthKey, neighbours, parseMonth } from "@/lib/ws/calendar";
import { coupleName, formatDate, todayIso } from "@/lib/ws/format";

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
  const params = await searchParams;
  const showAll = params.alles === "1";
  const today = todayIso();
  const { year, month } = parseMonth(typeof params.maand === "string" ? params.maand : undefined, today);
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
          <Link href={showAll ? "/beheer/bruidsparen/agenda" : "/beheer/bruidsparen/agenda?alles=1"} className="text-bordeaux hover:underline">
            {showAll ? "Alleen mijn afspraken en deadlines" : "Ook afspraken van bruidsparen met leveranciers tonen"}
          </Link>
        </p>
      </header>
      <Notice searchParams={searchParams} />

      <AgendaCalendar year={year} month={month} today={today} showAll={showAll} />

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

interface CalendarItem {
  on_date: string;
  kind: "appointment" | "deadline" | "wedding";
  title: string;
  at_time: string;
  with_sabine: boolean;
  couple_id: string;
  partner1_first: string;
  partner2_first: string;
}

const WEEKDAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"];

/**
 * Feedback Sabine: a month calendar on top of the agenda. A date on which she has something
 * planned (an appointment with her, or a wedding of one of her couples) has a bordeaux box,
 * so taken dates stand out; a deadline of a couple is a small dot.
 */
async function AgendaCalendar({ year, month, today, showAll }: { year: number; month: number; today: string; showAll: boolean }) {
  const weeks = monthGrid(year, month);
  const { from, to } = gridRange(weeks);
  const items = await query<CalendarItem>(
    `select a.on_date, a.kind, a.title, a.at_time, a.with_sabine, c.id as couple_id, c.partner1_first, c.partner2_first
       from appointments a join couples c on c.id = a.couple_id
      where a.on_date between $1 and $2 and c.status <> 'archived' and ($3 or a.with_sabine or a.kind = 'deadline')
     union all
     select c.wedding_date as on_date, 'wedding' as kind, 'Bruiloft' as title, '' as at_time, true as with_sabine, c.id, c.partner1_first, c.partner2_first
       from couples c
      where c.wedding_date between $1 and $2 and c.status <> 'archived'
      order by 1, 4`,
    [from, to, showAll],
  );
  const byDate = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const key = String(item.on_date).slice(0, 10);
    byDate.set(key, [...(byDate.get(key) ?? []), item]);
  }
  const { prev, next } = neighbours(year, month);
  const keep = showAll ? "&alles=1" : "";
  const title = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, 15, 12)));
  const thisMonth = today.slice(0, 7) === monthKey(year, month);
  const busy = (list: CalendarItem[]) => list.some((i) => i.kind === "wedding" || (i.kind === "appointment" && i.with_sabine));

  return (
    <section aria-labelledby="kalender-titel" className="card p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="kalender-titel" className="text-2xl capitalize">{title}</h2>
        <nav aria-label="Maand kiezen" className="flex items-center gap-1 text-sm">
          <Link href={`/beheer/bruidsparen/agenda?maand=${prev}${keep}`} className="btn-ghost px-3 py-1.5" aria-label="Vorige maand">←</Link>
          {!thisMonth && <Link href={`/beheer/bruidsparen/agenda?maand=${today.slice(0, 7)}${keep}`} className="btn-ghost px-3 py-1.5">Vandaag</Link>}
          <Link href={`/beheer/bruidsparen/agenda?maand=${next}${keep}`} className="btn-ghost px-3 py-1.5" aria-label="Volgende maand">→</Link>
        </nav>
      </div>
      <table className="w-full table-fixed border-separate border-spacing-1 text-sm">
        <thead>
          <tr>{WEEKDAYS.map((d) => <th key={d} scope="col" className="pb-1 text-xs font-medium text-muted uppercase">{d}</th>)}</tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0].date}>
              {week.map((d) => {
                const list = byDate.get(d.date) ?? [];
                const taken = busy(list);
                const label = list.map((i) => `${i.kind === "wedding" ? "Bruiloft" : i.kind === "deadline" ? "Deadline" : "Afspraak"}${i.at_time ? ` ${i.at_time}` : ""}: ${i.kind === "wedding" ? coupleName(i) : `${i.title} (${coupleName(i)})`}`).join("\n");
                return (
                  <td key={d.date} className="align-top">
                    <div
                      title={label || undefined}
                      className={`flex h-14 flex-col rounded-lg p-1.5 sm:h-20 ${d.inMonth ? "bg-white" : "bg-cream/50 text-muted/60"} ${
                        taken ? "border-2 border-bordeaux" : "border border-line"
                      } ${d.date === today ? "ring-2 ring-gold ring-offset-1" : ""}`}
                    >
                      <span className={`text-xs ${taken ? "font-semibold text-bordeaux" : ""}`}>{d.day}</span>
                      <span className="mt-auto hidden space-y-0.5 sm:block">
                        {list.slice(0, 2).map((i, n) => (
                          <span key={n} className={`block truncate text-[11px] leading-tight ${i.kind === "deadline" ? "text-muted" : "text-bordeaux"}`}>
                            {i.kind === "wedding" ? `♥ ${coupleName(i)}` : i.kind === "deadline" ? `• ${i.title}` : `${i.at_time ? `${i.at_time} ` : ""}${i.title}`}
                          </span>
                        ))}
                        {list.length > 2 && <span className="block text-[11px] text-muted">+{list.length - 2} meer</span>}
                      </span>
                      {list.length > 0 && <span className="sr-only">{label}</span>}
                      {!taken && list.length > 0 && <span aria-hidden className="mt-auto h-1.5 w-1.5 rounded-full bg-gold sm:hidden" />}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border-2 border-bordeaux" /> Bezet: een afspraak met jou of een bruiloft</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-1.5 w-1.5 rounded-full bg-gold" /> Alleen een deadline of afspraak zonder jou</span>
      </p>
    </section>
  );
}
