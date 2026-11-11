import { addAppointment, deleteAppointment, saveVenueAgreement } from "@/app/actions/ws-portal";
import { AutoTextarea } from "@/components/ws/AutoTextarea";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { requireCouple } from "@/lib/ws/access";
import { query } from "@/lib/ws/db";
import { formatDate, todayIso } from "@/lib/ws/format";
import type { Appointment } from "@/lib/ws/types";

export const metadata = { title: "Afspraken & deadlines" };

interface Venue {
  id: string;
  venue: string;
  times_due: string;
  guest_list_due: string;
  diet_due: string;
  notes: string;
}

/** Feedback Sabine (22): the agreements with a wedding venue, one form per venue. */
function VenueForm({ coupleId, venue, index }: { coupleId: string; venue?: Venue; index: number }) {
  const id = venue?.id ?? "nieuw";
  const field = (name: keyof Venue, label: string, placeholder: string) => (
    <div>
      <label className="label" htmlFor={`${name}-${id}`}>{label}</label>
      <input id={`${name}-${id}`} name={name} defaultValue={venue?.[name] ?? ""} maxLength={300} placeholder={placeholder} className="input" />
    </div>
  );
  return (
    <form action={saveVenueAgreement} className="space-y-3">
      <input type="hidden" name="coupleId" value={coupleId} />
      {venue ? <input type="hidden" name="venueId" value={venue.id} /> : <input type="hidden" name="intent" value="add" />}
      {field("venue", index === 0 ? "Trouwlocatie" : `Trouwlocatie ${index + 1}`, "Naam van de locatie")}
      <div className="grid gap-3 sm:grid-cols-3">
        {field("times_due", "Wanneer wil de locatie de tijden weten?", "Bijvoorbeeld: 4 weken van tevoren")}
        {field("guest_list_due", "Wanneer is de officiële gastenlijst nodig?", "Bijvoorbeeld: 1 mei")}
        {field("diet_due", "Wanneer zijn de dieetwensen nodig?", "Bijvoorbeeld: 2 weken van tevoren")}
      </div>
      <div>
        <label className="label" htmlFor={`notes-${id}`}>Overige afspraken en informatie</label>
        <AutoTextarea id={`notes-${id}`} name="notes" defaultValue={venue?.notes ?? ""} maxLength={4000} className="input min-h-20" placeholder="Alles wat verder met de locatie is afgesproken" />
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton className="btn-primary py-1.5" pendingText="Opslaan…">{venue ? "Opslaan" : "Toevoegen"}</SubmitButton>
        {venue && (
          <SubmitButton name="intent" value="delete" className="btn-ghost py-1.5 text-bordeaux" confirm={`Weet je het zeker? De afspraken met ${venue.venue || "deze locatie"} worden verwijderd.`}>
            Verwijderen
          </SubmitButton>
        )}
      </div>
    </form>
  );
}

export default async function AppointmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple, isAdmin } = await requireCouple(coupleId);
  const [items, venues] = await Promise.all([
    query<Appointment>("select * from appointments where couple_id = $1 order by on_date, at_time", [couple.id]),
    query<Venue>("select id, venue, times_due, guest_list_due, diet_due, notes from venue_agreements where couple_id = $1 order by position, created_at", [couple.id]),
  ]);
  const today = todayIso();
  const upcoming = items.filter((a) => a.on_date >= today);
  const past = items.filter((a) => a.on_date < today).reverse();

  const Row = ({ a }: { a: Appointment }) => (
    <tr className="border-t border-line align-top">
      <td data-label="Datum" className="px-4 py-3 whitespace-nowrap">{formatDate(a.on_date)}{a.at_time && <span className="block text-xs text-muted">{a.at_time}</span>}</td>
      <td data-label="Type" className="px-4 py-3">
        <span className={`rounded-full px-2 py-0.5 text-xs ${a.kind === "deadline" ? "bg-bordeaux-soft text-bordeaux" : "bg-cream text-gold-ink"}`}>
          {a.kind === "deadline" ? "Deadline" : "Afspraak"}
        </span>
      </td>
      <td className="stack-full px-4 py-3">
        {a.title}
        {a.with_sabine && <span className="ml-2 text-xs text-gold-ink">met Sabine</span>}
        {a.notes && <span className="block text-xs whitespace-pre-line text-muted">{a.notes}</span>}
      </td>
      <td className="stack-full px-4 py-3 text-right">
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
        {/* Feedback Sabine (4): a compact card per appointment on a phone (stack-table, globals.css). */}
        <table className="stack-table w-full text-sm sm:min-w-[560px]">
          <thead className="table-head"><tr><th className="px-4 py-2.5">Datum</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Wat</th><th className="px-4 py-2.5"><span className="sr-only">Acties</span></th></tr></thead>
          <tbody>
            {upcoming.map((a) => <Row key={a.id} a={a} />)}
            {upcoming.length === 0 && <tr><td colSpan={4} className="stack-full px-4 py-6 text-center text-muted">Geen komende afspraken of deadlines.</td></tr>}
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

      <section id="locatie" className="card scroll-mt-6 space-y-5 p-5">
        <div>
          <h2 className="text-lg">Afspraken met de locatie</h2>
          <p className="mt-1 text-sm text-muted">Wat er met de trouwlocatie is afgesproken en wanneer de locatie wat nodig heeft. Trouwen jullie op twee locaties? Voeg dan een tweede locatie toe.</p>
        </div>
        {venues.map((v, i) => (
          <div key={v.id} className={i > 0 ? "border-t border-line pt-5" : ""}>
            <VenueForm coupleId={couple.id} venue={v} index={i} />
          </div>
        ))}
        {venues.length === 0 ? (
          <VenueForm coupleId={couple.id} index={0} />
        ) : (
          <details className="border-t border-line pt-4">
            <summary className="cursor-pointer text-sm font-medium text-bordeaux">+ Nog een locatie toevoegen</summary>
            <div className="mt-3"><VenueForm coupleId={couple.id} index={venues.length} /></div>
          </details>
        )}
      </section>

      {past.length > 0 && (
        <details className="card p-5">
          <summary className="cursor-pointer text-sm text-muted">Eerder ({past.length})</summary>
          <table className="stack-table mt-3 w-full text-sm"><tbody>{past.map((a) => <Row key={a.id} a={a} />)}</tbody></table>
        </details>
      )}
    </div>
  );
}
