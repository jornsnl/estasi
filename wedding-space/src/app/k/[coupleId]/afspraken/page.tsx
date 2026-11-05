import { addAppointment, deleteAppointment } from "@/app/actions/portal";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { requireCouple } from "@/lib/auth/access";
import { query } from "@/lib/db";
import { formatDate, todayIso } from "@/lib/domain/format";
import type { Appointment } from "@/lib/types";

export const metadata = { title: "Afspraken & deadlines" };

export default async function AppointmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple, isAdmin } = await requireCouple(coupleId);
  const items = await query<Appointment>("select * from appointments where couple_id = $1 order by on_date, at_time", [couple.id]);
  const today = todayIso();
  const upcoming = items.filter((a) => a.on_date >= today);
  const past = items.filter((a) => a.on_date < today).reverse();

  const Row = ({ a }: { a: Appointment }) => (
    <tr className="border-t border-line align-top">
      <td className="px-4 py-3 whitespace-nowrap">{formatDate(a.on_date)}{a.at_time && <span className="block text-xs text-muted">{a.at_time}</span>}</td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2 py-0.5 text-xs ${a.kind === "deadline" ? "bg-bordeaux-soft text-bordeaux" : "bg-cream text-gold-ink"}`}>
          {a.kind === "deadline" ? "Deadline" : "Afspraak"}
        </span>
      </td>
      <td className="px-4 py-3">
        {a.title}
        {a.with_sabine && <span className="ml-2 text-xs text-gold-ink">met Sabine</span>}
        {a.notes && <span className="block text-xs whitespace-pre-line text-muted">{a.notes}</span>}
      </td>
      <td className="px-4 py-3 text-right">
        <form action={deleteAppointment}>
          <input type="hidden" name="coupleId" value={couple.id} />
          <input type="hidden" name="appointmentId" value={a.id} />
          <SubmitButton className="text-xs text-muted hover:text-bordeaux" confirm={`"${a.title}" verwijderen?`}>Verwijderen</SubmitButton>
        </form>
      </td>
    </tr>
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Onderdeel</p>
        <h1 className="mt-1 text-3xl">Afspraken & deadlines</h1>
        <p className="mt-1 text-sm text-muted">Alle afspraken met Sabine en leveranciers, en de data waarop iets geregeld moet zijn.</p>
      </header>
      <Notice searchParams={searchParams} />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="table-head"><tr><th className="px-4 py-2.5">Datum</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Wat</th><th className="px-4 py-2.5"><span className="sr-only">Acties</span></th></tr></thead>
          <tbody>
            {upcoming.map((a) => <Row key={a.id} a={a} />)}
            {upcoming.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">Geen komende afspraken of deadlines.</td></tr>}
          </tbody>
        </table>
      </div>

      <form action={addAppointment} className="card grid gap-3 p-5 sm:grid-cols-6">
        <input type="hidden" name="coupleId" value={couple.id} />
        <h2 className="text-lg sm:col-span-6">Toevoegen</h2>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="kind">Type</label>
          <select id="kind" name="kind" className="input"><option value="appointment">Afspraak</option><option value="deadline">Deadline</option></select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="onDate">Datum</label>
          <input id="onDate" name="onDate" type="date" required className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="atTime">Tijd (optioneel)</label>
          <input id="atTime" name="atTime" type="time" className="input" />
        </div>
        <div className="sm:col-span-6">
          <label className="label" htmlFor="title">Wat</label>
          <input id="title" name="title" required maxLength={200} className="input" placeholder="Bijvoorbeeld: proeverij catering" />
        </div>
        <div className="sm:col-span-6">
          <label className="label" htmlFor="notes">Notitie (optioneel)</label>
          <textarea id="notes" name="notes" rows={2} className="input" />
        </div>
        {isAdmin && (
          <label className="flex items-center gap-2 text-sm sm:col-span-6">
            <input type="checkbox" name="withSabine" defaultChecked className="accent-[#6B1E2E]" /> Afspraak met mij (komt in mijn agenda)
          </label>
        )}
        <div className="sm:col-span-6"><SubmitButton className="btn-primary">Toevoegen</SubmitButton></div>
      </form>

      {past.length > 0 && (
        <details className="card p-5">
          <summary className="cursor-pointer text-sm text-muted">Eerder ({past.length})</summary>
          <table className="mt-3 w-full text-sm"><tbody>{past.map((a) => <Row key={a.id} a={a} />)}</tbody></table>
        </details>
      )}
    </div>
  );
}
