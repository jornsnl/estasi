import Link from "next/link";
import { saveGuest } from "@/app/actions/ws-fase2";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { requireCouple } from "@/lib/ws/access";
import { query } from "@/lib/ws/db";
import { formatDateTime } from "@/lib/ws/format";

export const metadata = { title: "Gastenlijst & RSVP" };

interface Guest {
  id: string;
  response_id: string | null;
  form_name: string | null;
  first_name: string;
  last_name: string;
  relation: string;
  email: string;
  phone: string;
  diet: string;
  attendance: "yes" | "no" | "partial";
  partial_note: string;
  is_kid: boolean;
  notes: string;
  created_at: Date;
}

const ATTENDANCE = { yes: "Aanwezig", partial: "Deel van de dag", no: "Afwezig" } as const;

function GuestForm({ coupleId, guest }: { coupleId: string; guest?: Guest }) {
  const k = guest?.id ?? "nieuw";
  return (
    <form action={saveGuest} className="grid gap-2 sm:grid-cols-6">
      <input type="hidden" name="coupleId" value={coupleId} />
      {guest && <input type="hidden" name="guestId" value={guest.id} />}
      <input name="firstName" required defaultValue={guest?.first_name} placeholder="Voornaam" aria-label="Voornaam" className="input py-1.5 sm:col-span-2" />
      <input name="lastName" defaultValue={guest?.last_name} placeholder="Achternaam" aria-label="Achternaam" className="input py-1.5 sm:col-span-2" />
      <select name="attendance" defaultValue={guest?.attendance ?? "yes"} aria-label="Aanwezigheid" className="input py-1.5 sm:col-span-2">
        {Object.entries(ATTENDANCE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <input name="relation" defaultValue={guest?.relation} placeholder="Relatie" aria-label="Relatie" className="input py-1.5 sm:col-span-2" />
      <input name="email" type="email" defaultValue={guest?.email} placeholder="E-mail" aria-label="E-mail" className="input py-1.5 sm:col-span-2" />
      <input name="phone" defaultValue={guest?.phone} placeholder="Telefoon" aria-label="Telefoon" className="input py-1.5 sm:col-span-2" />
      <input name="diet" defaultValue={guest?.diet} placeholder="Dieet / allergieën" aria-label="Dieet of allergieën" className="input py-1.5 sm:col-span-3" />
      <input name="partialNote" defaultValue={guest?.partial_note} placeholder="Tijden (deel van de dag)" aria-label="Tijden bij deel van de dag" className="input py-1.5 sm:col-span-3" />
      <input name="notes" defaultValue={guest?.notes} placeholder="Notitie" aria-label="Notitie" className="input py-1.5 sm:col-span-4" />
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="isKid" defaultChecked={guest?.is_kid} className="accent-[#6B1E2E]" id={`kid-${k}`} /> Kind</label>
      <div className="flex gap-2 sm:col-span-6">
        <SubmitButton className="btn-primary py-1.5" pendingText="Opslaan…">{guest ? "Opslaan" : "Gast toevoegen"}</SubmitButton>
        {guest && <SubmitButton name="intent" value="delete" className="btn-ghost py-1.5 text-bordeaux" confirm={`${guest.first_name} verwijderen uit de gastenlijst?`}>Verwijderen</SubmitButton>}
      </div>
    </form>
  );
}

export default async function GuestList({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple } = await requireCouple(coupleId);
  const guests = await query<Guest>(
    `select g.*, f.name as form_name from guests g left join rsvp_forms f on f.id = g.form_id
      where g.couple_id = $1 order by g.created_at, g.id`,
    [couple.id],
  );
  const coming = guests.filter((g) => g.attendance !== "no");
  const counts = {
    total: coming.length,
    kids: coming.filter((g) => g.is_kid).length,
    partial: coming.filter((g) => g.attendance === "partial").length,
    declined: guests.length - coming.length,
  };
  const byForm = new Map<string, number>();
  for (const g of coming) byForm.set(g.form_name ?? "Handmatig", (byForm.get(g.form_name ?? "Handmatig") ?? 0) + 1);
  // People who signed up together get the same colour bar.
  const groupSize = new Map<string, number>();
  for (const g of guests) if (g.response_id) groupSize.set(g.response_id, (groupSize.get(g.response_id) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Onderdeel</p>
          <h1 className="mt-1 text-3xl">Gastenlijst & RSVP</h1>
          <p className="mt-1 text-sm text-muted">Iedereen die zich via een RSVP-formulier aanmeldt, komt hier vanzelf in. Ook wie iemand meeneemt: ieder krijgt een eigen regel.</p>
        </div>
        <Link href={`/k/${couple.id}/gasten/formulieren`} className="btn-secondary">RSVP-formulieren & QR-codes</Link>
      </header>
      <Notice searchParams={searchParams} />

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="card p-4"><p className="text-sm text-muted">Komen</p><p className="font-serif text-3xl">{counts.total}</p></div>
        <div className="card p-4"><p className="text-sm text-muted">Waarvan kinderen</p><p className="font-serif text-3xl">{counts.kids}</p></div>
        <div className="card p-4"><p className="text-sm text-muted">Deel van de dag</p><p className="font-serif text-3xl">{counts.partial}</p></div>
        <div className="card p-4"><p className="text-sm text-muted">Kunnen niet</p><p className="font-serif text-3xl">{counts.declined}</p></div>
      </section>
      {byForm.size > 0 && <p className="text-sm text-muted">{[...byForm.entries()].map(([name, n]) => `${name}: ${n}`).join(" · ")}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="table-head">
            <tr><th className="px-4 py-2.5">Naam</th><th className="px-4 py-2.5">Relatie</th><th className="px-4 py-2.5">E-mail</th><th className="px-4 py-2.5">Telefoon</th><th className="px-4 py-2.5">Aanwezig</th><th className="px-4 py-2.5">Dieet</th></tr>
          </thead>
          <tbody>
            {guests.map((g) => {
              const linked = g.response_id && (groupSize.get(g.response_id) ?? 0) > 1;
              return (
                <tr key={g.id} className="border-t border-line align-top">
                  <td className={`px-4 py-2.5 ${linked ? "border-l-4 border-l-gold" : ""}`}>
                    <details>
                      <summary className="cursor-pointer">
                        {g.first_name} {g.last_name}{g.is_kid && <span className="ml-1 text-xs text-muted">(kind)</span>}
                      </summary>
                      <div className="mt-2 rounded-xl bg-cream p-3"><GuestForm coupleId={couple.id} guest={g} /></div>
                    </details>
                    {g.notes && <span className="block text-xs text-muted">{g.notes}</span>}
                    {g.form_name && <span className="block text-xs text-muted">via {g.form_name} · {formatDateTime(g.created_at)}</span>}
                  </td>
                  <td className="px-4 py-2.5">{g.relation || "–"}</td>
                  <td className="px-4 py-2.5">{g.email || "–"}</td>
                  <td className="px-4 py-2.5">{g.phone || "–"}</td>
                  <td className="px-4 py-2.5">
                    <span className={g.attendance === "no" ? "text-muted" : ""}>{ATTENDANCE[g.attendance]}</span>
                    {g.partial_note && <span className="block text-xs text-muted">{g.partial_note}</span>}
                  </td>
                  <td className="px-4 py-2.5">{g.diet || "–"}</td>
                </tr>
              );
            })}
            {guests.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Nog geen gasten. Deel een RSVP-formulier of voeg gasten hieronder toe.</td></tr>}
          </tbody>
        </table>
        <p className="border-t border-line px-4 py-2 text-xs text-muted">Een gouden streep links: deze gasten hebben zich samen aangemeld.</p>
      </div>

      <section className="card p-5">
        <h2 className="mb-3 text-lg">Gast toevoegen</h2>
        <GuestForm coupleId={couple.id} />
      </section>
    </div>
  );
}
