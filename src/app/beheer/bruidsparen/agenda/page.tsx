import Link from "next/link";
import { addAgendaItem, deleteOwnAppointment } from "@/app/actions/ws-admin";
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
  notes: string;
  /** Null for Sabine's own appointments (feedback Sabine, nr. 7). */
  couple_id: string | null;
  partner1_first: string;
  partner2_first: string;
}

const isOwn = (r: { couple_id: string | null }) => r.couple_id === null;
const kindLabel = (r: { kind: string; couple_id: string | null; with_sabine: boolean }) =>
  r.kind === "deadline" ? "Deadline" : r.kind === "wedding" ? "Bruiloft" : isOwn(r) ? "Eigen afspraak" : r.with_sabine ? "Afspraak met mij" : "Afspraak";
// Own appointments in the green house colour (gold green), deadlines bordeaux, the rest cream.
const kindTone = (r: { kind: string; couple_id: string | null }) =>
  r.kind === "deadline" ? "bg-bordeaux-soft text-bordeaux" : isOwn(r) ? "bg-gold text-white" : "bg-cream text-gold-ink";

/** Every appointment and deadline of couples, plus Sabine's own ones, between two dates. */
const AGENDA_SQL = `
  select a.id, a.kind, a.title, a.on_date, a.at_time, a.with_sabine, a.notes, c.id as couple_id, c.partner1_first, c.partner2_first
    from appointments a join couples c on c.id = a.couple_id
   where a.on_date between $1 and $2 and c.status <> 'archived' and ($3 or a.with_sabine or a.kind = 'deadline')
  union all
  select o.id, o.kind, o.title, o.on_date, o.at_time, true, o.notes, null, '', ''
    from own_appointments o
   where o.on_date between $1 and $2`;

/** Appointments and deadlines of every couple in one agenda (h9.5). */
export default async function Agenda({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const showAll = params.alles === "1";
  const today = todayIso();
  const { year, month } = parseMonth(typeof params.maand === "string" ? params.maand : undefined, today);
  const day = typeof params.dag === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.dag) ? params.dag : null;
  const [rows, couples, dayRows] = await Promise.all([
    query<Row>(`${AGENDA_SQL} order by 4, 5`, [today, "9999-12-31", showAll]),
    listCouples(),
    day
      ? query<Row | WeddingRow>(
          `${AGENDA_SQL}
           union all
           select c.id, 'wedding', 'Bruiloft', c.wedding_date, '', true, '', c.id, c.partner1_first, c.partner2_first
             from couples c where c.wedding_date between $1 and $2 and c.status <> 'archived'
           order by 4, 5`,
          [day, day, true],
        )
      : Promise.resolve([]),
  ]);
  const keep = `${showAll ? "&alles=1" : ""}`;
  const here = `/beheer/bruidsparen/agenda?maand=${monthKey(year, month)}${keep}${day ? `&dag=${day}` : ""}`;
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

      <AgendaCalendar year={year} month={month} today={today} showAll={showAll} selected={day} />

      {/* Feedback Sabine (7): a click on a date in the calendar shows what is planned that day. */}
      {day && (
        <section id="dag" aria-labelledby="dag-titel" className="card scroll-mt-6 p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="dag-titel" className="text-xl">{formatDate(day)}</h2>
            <Link href={`/beheer/bruidsparen/agenda?maand=${monthKey(year, month)}${keep}`} className="text-sm text-muted hover:text-bordeaux">Sluiten</Link>
          </div>
          <DayDetails rows={dayRows} back={here} />
        </section>
      )}

      {months.size === 0 && <p className="card p-6 text-muted">Niets gepland.</p>}
      {[...months.entries()].map(([month, items]) => (
        <section key={month}>
          <h2 className="section-title mb-2 capitalize">{new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" }).format(new Date(`${month}-15T12:00:00Z`))}</h2>
          <ul className="card divide-y divide-line">
            {items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 p-4 text-sm">
                <span className="w-36 shrink-0 font-medium">{formatDate(a.on_date, false)}{a.at_time ? ` · ${a.at_time}` : ""}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${kindTone(a)}`}>{kindLabel(a)}</span>
                <Link href={`/beheer/bruidsparen/agenda?maand=${a.on_date.slice(0, 7)}${keep}&dag=${a.on_date}#dag`} className="flex-1 hover:text-bordeaux">{a.title}</Link>
                {a.couple_id ? (
                  <Link href={`/k/${a.couple_id}/afspraken`} className="text-muted hover:text-bordeaux">{coupleName(a)}</Link>
                ) : (
                  <span className="text-gold-ink">Sabine</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <form action={addAgendaItem} className="card grid gap-3 p-5 sm:grid-cols-6">
        <h2 className="text-lg sm:col-span-6">Afspraak toevoegen</h2>
        <div className="sm:col-span-3">
          <label className="label" htmlFor="coupleId">Bruidspaar of eigen afspraak</label>
          <select id="coupleId" name="coupleId" required className="input">
            {/* Feedback Sabine (7): an appointment of her own, without a couple. */}
            <option value="sabine">Sabine (eigen afspraak, zonder bruidspaar)</option>
            {couples.map((c) => <option key={c.id} value={c.id}>{coupleName(c)}</option>)}
          </select>
        </div>
        <div className="sm:col-span-3">
          <label className="label" htmlFor="kind">Type</label>
          <select id="kind" name="kind" className="input">
            <option value="appointment">Afspraak met mij</option>
            <option value="plain">Afspraak</option>
            <option value="deadline">Deadline</option>
          </select>
        </div>
        <div className="sm:col-span-2"><label className="label" htmlFor="onDate">Datum</label><input id="onDate" name="onDate" type="date" required defaultValue={day ?? undefined} className="input" /></div>
        <div className="sm:col-span-1"><label className="label" htmlFor="atTime">Tijd</label><input id="atTime" name="atTime" type="time" className="input" /></div>
        <div className="sm:col-span-3"><label className="label" htmlFor="title">Wat</label><input id="title" name="title" required maxLength={200} className="input" placeholder="Bijvoorbeeld: Meeting 2" /></div>
        <div className="sm:col-span-6"><label className="label" htmlFor="notes">Notitie (optioneel)</label><textarea id="notes" name="notes" rows={2} maxLength={2000} className="input" /></div>
        <div className="sm:col-span-6"><SubmitButton className="btn-primary">Toevoegen</SubmitButton></div>
      </form>
    </div>
  );
}

function DayDetails({ rows, back }: { rows: (Row | WeddingRow)[]; back: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted">Niets gepland op deze dag. Voeg hieronder een afspraak toe; de datum staat al klaar.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {rows.map((a) => (
        <li key={`${a.kind}-${a.id}`} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3">
          <span className="w-14 shrink-0 font-medium">{a.at_time || "–"}</span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs ${kindTone(a)}`}>{kindLabel(a)}</span>
              <span className="font-medium">{a.title}</span>
            </p>
            <p className="mt-0.5 text-muted">
              {a.couple_id ? <Link href={`/k/${a.couple_id}/${a.kind === "wedding" ? "" : "afspraken"}`} className="hover:text-bordeaux">{coupleName(a)}</Link> : "Sabine"}
            </p>
            {a.notes && <p className="mt-1 whitespace-pre-line text-muted">{a.notes}</p>}
          </div>
          {isOwn(a) && (
            <form action={deleteOwnAppointment}>
              <input type="hidden" name="appointmentId" value={a.id} />
              <input type="hidden" name="back" value={`${back}#dag`} />
              <SubmitButton className="text-xs text-muted hover:text-bordeaux" confirm={`Weet je het zeker? "${a.title}" wordt verwijderd.`}>Verwijderen</SubmitButton>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}

type WeddingRow = Omit<Row, "kind"> & { kind: "wedding" };

interface CalendarItem {
  on_date: string;
  kind: "appointment" | "deadline" | "wedding";
  title: string;
  at_time: string;
  with_sabine: boolean;
  couple_id: string | null;
  partner1_first: string;
  partner2_first: string;
}

const WEEKDAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"];

/**
 * Feedback Sabine: a month calendar on top of the agenda. A date on which she has something
 * planned (an appointment with her, or a wedding of one of her couples) has a bordeaux box,
 * so taken dates stand out; a deadline of a couple is a small dot. Her own appointments
 * (without a couple) are in the green house colour, and a click on a date shows what is
 * planned that day (feedback Sabine, nr. 7).
 */
async function AgendaCalendar({ year, month, today, showAll, selected }: { year: number; month: number; today: string; showAll: boolean; selected: string | null }) {
  const weeks = monthGrid(year, month);
  const { from, to } = gridRange(weeks);
  const items = await query<CalendarItem>(
    `select a.on_date, a.kind, a.title, a.at_time, a.with_sabine, c.id as couple_id, c.partner1_first, c.partner2_first
       from appointments a join couples c on c.id = a.couple_id
      where a.on_date between $1 and $2 and c.status <> 'archived' and ($3 or a.with_sabine or a.kind = 'deadline')
     union all
     select o.on_date, o.kind, o.title, o.at_time, true, null, '', ''
       from own_appointments o
      where o.on_date between $1 and $2
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
  const busy = (list: CalendarItem[]) => list.some((i) => i.kind === "wedding" || (i.kind === "appointment" && i.with_sabine && i.couple_id));
  const ownBusy = (list: CalendarItem[]) => list.some((i) => i.couple_id === null && i.kind === "appointment");
  const text = (i: CalendarItem) => (i.kind === "wedding" ? coupleName(i) : i.couple_id ? `${i.title} (${coupleName(i)})` : `${i.title} (Sabine)`);

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
                const own = !taken && ownBusy(list);
                const label = list.map((i) => `${kindLabel(i)}${i.at_time ? ` ${i.at_time}` : ""}: ${text(i)}`).join("\n");
                const box = `flex h-14 flex-col rounded-lg p-1.5 sm:h-20 ${d.inMonth ? "bg-white" : "bg-cream/50 text-muted/60"} ${
                  taken ? "border-2 border-bordeaux" : own ? "border-2 border-gold" : "border border-line"
                } ${d.date === today ? "ring-2 ring-gold ring-offset-1" : ""} ${d.date === selected ? "bg-cream-deep" : ""}`;
                const inner = (
                  <>
                    <span className={`text-xs ${taken ? "font-semibold text-bordeaux" : own ? "font-semibold text-gold-ink" : ""}`}>{d.day}</span>
                    <span className="mt-auto hidden space-y-0.5 sm:block">
                      {list.slice(0, 2).map((i, n) => (
                        <span key={n} className={`block truncate text-[11px] leading-tight ${i.kind === "deadline" ? "text-muted" : i.couple_id === null ? "font-medium text-gold-ink" : "text-bordeaux"}`}>
                          {i.kind === "wedding" ? `♥ ${coupleName(i)}` : i.kind === "deadline" ? `• ${i.title}` : `${i.at_time ? `${i.at_time} ` : ""}${i.title}`}
                        </span>
                      ))}
                      {list.length > 2 && <span className="block text-[11px] text-muted">+{list.length - 2} meer</span>}
                    </span>
                    {list.length > 0 && <span className="sr-only">{label}</span>}
                    {!taken && !own && list.length > 0 && <span aria-hidden className="mt-auto h-1.5 w-1.5 rounded-full bg-gold sm:hidden" />}
                  </>
                );
                return (
                  <td key={d.date} className="align-top">
                    {list.length > 0 ? (
                      <Link href={`/beheer/bruidsparen/agenda?maand=${monthKey(year, month)}${keep}&dag=${d.date}#dag`} title={label} className={`${box} hover:bg-cream`}>
                        {inner}
                      </Link>
                    ) : (
                      <div className={box}>{inner}</div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border-2 border-bordeaux" /> Bezet: een afspraak met jou of een bruiloft</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border-2 border-gold" /> Eigen afspraak</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-1.5 w-1.5 rounded-full bg-gold" /> Alleen een deadline of afspraak zonder jou</span>
        <span>Klik op een datum om de afspraken te zien.</span>
      </p>
    </section>
  );
}
