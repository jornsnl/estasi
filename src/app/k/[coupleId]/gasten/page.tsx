import Link from "next/link";
import { markInfoHandled, saveGuest } from "@/app/actions/ws-rsvp";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { GuestTabs } from "@/components/ws/GuestTabs";
import { SelectAllGuests } from "@/components/ws/SelectAllGuests";
import { requirePlanning } from "@/lib/ws/access";
import { query } from "@/lib/ws/db";
import { formatDateTime, plural } from "@/lib/ws/format";
import { groupsOf, type GuestGroup } from "@/lib/ws/rsvp";

export const metadata = { title: "Gastenlijst & RSVP" };

export interface GuestRow {
  id: string;
  response_id: string | null;
  group_id: string | null;
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
  manual: boolean;
  notes: string;
  created_at: Date;
}

const ATTENDANCE = { yes: "Aanwezig", partial: "Deel van de dag", no: "Afwezig" } as const;

function ConfirmationLabel({ state }: { state?: { status: "sent" | "failed"; at: Date } }) {
  if (!state) return <span className="block text-xs text-muted">Bevestiging: niet bekend</span>;
  return state.status === "sent" ? (
    <span className="block text-xs text-success">✓ Bevestiging verstuurd {formatDateTime(state.at)}</span>
  ) : (
    <span className="block text-xs text-bordeaux">Bevestiging niet verstuurd</span>
  );
}

function GuestForm({ coupleId, groups, guest }: { coupleId: string; groups: GuestGroup[]; guest?: GuestRow }) {
  return (
    <form action={saveGuest} className="grid gap-2 sm:grid-cols-6">
      <input type="hidden" name="coupleId" value={coupleId} />
      {guest && <input type="hidden" name="guestId" value={guest.id} />}
      <input name="firstName" required defaultValue={guest?.first_name} placeholder="Voornaam" aria-label="Voornaam" className="input py-1.5 sm:col-span-2" />
      <input name="lastName" defaultValue={guest?.last_name} placeholder="Achternaam" aria-label="Achternaam" className="input py-1.5 sm:col-span-2" />
      <select name="groupId" defaultValue={guest?.group_id ?? groups[0]?.id} aria-label="Gastengroep" className="input py-1.5 sm:col-span-2">
        {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
      <select name="attendance" defaultValue={guest?.attendance ?? "yes"} aria-label="Aanwezigheid" className="input py-1.5 sm:col-span-2">
        {Object.entries(ATTENDANCE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <input name="relation" defaultValue={guest?.relation} placeholder="Relatie" aria-label="Relatie" className="input py-1.5 sm:col-span-2" />
      <input name="phone" defaultValue={guest?.phone} placeholder="Telefoon" aria-label="Telefoon" className="input py-1.5 sm:col-span-2" />
      <input name="email" type="email" defaultValue={guest?.email} placeholder="E-mail" aria-label="E-mail" className="input py-1.5 sm:col-span-2" />
      <input name="diet" defaultValue={guest?.diet} placeholder="Dieet / allergieën" aria-label="Dieet of allergieën" className="input py-1.5 sm:col-span-2" />
      <input name="partialNote" defaultValue={guest?.partial_note} placeholder="Tijden (deel van de dag)" aria-label="Tijden bij deel van de dag" className="input py-1.5 sm:col-span-2" />
      <input name="notes" defaultValue={guest?.notes} placeholder="Notitie" aria-label="Notitie" className="input py-1.5 sm:col-span-4" />
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="isKid" defaultChecked={guest?.is_kid} className="accent-[#6B1E2E]" /> Kind</label>
      <div className="flex gap-2 sm:col-span-6">
        <SubmitButton className="btn-primary py-1.5" pendingText="Opslaan…">{guest ? "Opslaan" : "Toevoegen"}</SubmitButton>
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
  const { couple, isAdmin } = await requirePlanning(coupleId);
  const [groups, guests, infoRequests, confirmations] = await Promise.all([
    groupsOf(couple.id),
    query<GuestRow>(
      `select g.*, f.name as form_name from guests g left join rsvp_forms f on f.id = g.form_id
        where g.couple_id = $1 order by g.created_at, g.response_id, g.id`,
      [couple.id],
    ),
    isAdmin
      ? query<{ id: string; first_name: string; last_name: string; email: string; phone: string; form: string | null; created_at: Date }>(
          `select r.id, r.first_name, r.last_name, r.email, r.phone, f.name as form, r.created_at from rsvp_responses r
             left join rsvp_forms f on f.id = r.form_id
            where r.couple_id = $1 and r.dresscode_ok = false and r.info_handled_at is null order by r.created_at`,
          [couple.id],
        )
      : [],
    // Feedback 5.5: per sign-up, whether the confirmation mail went out (the latest attempt). Mail history is Sabine's only.
    isAdmin
      ? query<{ response_id: string; status: "sent" | "failed"; at: Date }>(
          `select distinct on (response_id) response_id, status, updated_at as at from mail_log
            where couple_id = $1 and kind = 'rsvp_bevestiging' and response_id is not null order by response_id, created_at desc`,
          [couple.id],
        )
      : [],
  ]);
  const confirmation = new Map(confirmations.map((c) => [c.response_id, c]));
  const mailForm = `/k/${couple.id}/gasten/mail`;
  const coming = guests.filter((g) => g.attendance !== "no");
  const declined = guests.filter((g) => g.attendance === "no");
  const blocks = [
    ...groups.map((g) => ({ id: g.id, name: g.name, guests: coming.filter((x) => x.group_id === g.id) })),
    { id: "none", name: "Zonder groep", guests: coming.filter((x) => !x.group_id || !groups.some((g) => g.id === x.group_id)) },
  ].filter((b) => b.id !== "none" || b.guests.length > 0);

  const table = (list: GuestRow[]) => {
    // People who signed up together stay together, with alternating backgrounds per sign-up.
    let shade = false;
    let last: string | null = null;
    return (
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="table-head">
            <tr><th className="px-4 py-2.5">Naam</th><th className="px-4 py-2.5">Relatie</th><th className="px-4 py-2.5">Telefoon</th><th className="px-4 py-2.5">Aanwezig</th><th className="px-4 py-2.5">Dieet / allergieën</th></tr>
          </thead>
          <tbody>
            {list.map((g) => {
              const key = g.response_id ?? g.id;
              if (key !== last) shade = !shade;
              last = key;
              return (
                <tr key={g.id} className={`border-t border-line align-top ${shade ? "bg-cream/60" : ""}`}>
                  <td className="px-4 py-2.5">
                    {isAdmin && g.email && (
                      <input type="checkbox" form="mail-gasten" name="gast" value={g.id} aria-label={`${g.first_name} selecteren om te mailen`} className="mr-2 accent-[#6B1E2E]" />
                    )}
                    {isAdmin ? (
                      <details className="inline-block align-top">
                        <summary className="cursor-pointer">{g.first_name} {g.last_name}</summary>
                        <div className="mt-2 rounded-xl bg-white p-3 shadow-sm"><GuestForm coupleId={couple.id} groups={groups} guest={g} /></div>
                      </details>
                    ) : (
                      <span>{g.first_name} {g.last_name}</span>
                    )}
                    {g.is_kid && <span className="ml-1 rounded-full bg-gold-soft px-1.5 text-xs text-gold-ink">kind</span>}
                    {g.manual && <span className="ml-1 rounded-full bg-cream-deep px-1.5 text-xs text-muted">Handmatig toegevoegd</span>}
                    {g.notes && <span className="block text-xs text-muted">{g.notes}</span>}
                    {g.form_name && <span className="block text-xs text-muted">via {g.form_name} · {formatDateTime(g.created_at)}</span>}
                    {g.response_id && <ConfirmationLabel state={confirmation.get(g.response_id)} />}
                  </td>
                  <td className="px-4 py-2.5">{g.relation || "–"}</td>
                  <td className="px-4 py-2.5">
                    {g.phone || "–"}
                    {g.email && <span className="block text-xs text-muted">{g.email}</span>}
                    {isAdmin && g.email && <Link href={`${mailForm}?gast=${g.id}`} className="text-xs text-bordeaux underline">Mail sturen</Link>}
                  </td>
                  <td className="px-4 py-2.5">
                    {ATTENDANCE[g.attendance]}
                    {g.partial_note && <span className="block text-xs text-muted">{g.partial_note}</span>}
                  </td>
                  <td className="px-4 py-2.5">{g.diet || "–"}</td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">Nog niemand.</td></tr>}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <p className="eyebrow">Onderdeel</p>
          <h1 className="mt-1 text-3xl">Gastenlijst & RSVP</h1>
          <p className="mt-1 text-sm text-muted">Iedereen die zich via een RSVP-formulier aanmeldt, komt hier vanzelf in; ook wie iemand meeneemt krijgt een eigen regel.</p>
        </div>
        <GuestTabs coupleId={couple.id} current="gasten" isAdmin={isAdmin} />
      </header>
      <Notice searchParams={searchParams} />

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="card p-4"><p className="text-sm text-muted">Komen</p><p className="font-serif text-3xl">{coming.length}</p></div>
        <div className="card p-4"><p className="text-sm text-muted">Waarvan kinderen</p><p className="font-serif text-3xl">{coming.filter((g) => g.is_kid).length}</p></div>
        <div className="card p-4"><p className="text-sm text-muted">Deel van de dag</p><p className="font-serif text-3xl">{coming.filter((g) => g.attendance === "partial").length}</p></div>
        <div className="card p-4"><p className="text-sm text-muted">Kunnen niet</p><p className="font-serif text-3xl">{declined.length}</p></div>
      </section>

      {infoRequests.length > 0 && (
        <section id="actiepunten" className="card scroll-mt-6 border border-bordeaux/30 p-5">
          <h2 className="text-lg">Actiepunten: meer informatie over de dresscode</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {infoRequests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <strong>{r.first_name} {r.last_name}</strong> ({r.form ?? "formulier"}) · {r.email}{r.phone ? ` · ${r.phone}` : ""}
                  <span className="block text-xs text-muted">{formatDateTime(r.created_at)}</span>
                </span>
                <form action={markInfoHandled}>
                  <input type="hidden" name="coupleId" value={couple.id} />
                  <input type="hidden" name="responseId" value={r.id} />
                  <SubmitButton className="btn-secondary py-1 text-xs">Afgehandeld</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdmin && (
        <form id="mail-gasten" method="get" action={mailForm} className="flex flex-wrap items-center gap-3 text-sm">
          <SelectAllGuests form="mail-gasten" />
          <button type="submit" className="btn-secondary py-1.5">Mail sturen aan geselecteerde gasten</button>
          <span className="text-xs text-muted">Vink gasten aan in de lijst; elke gast krijgt een eigen mail.</span>
        </form>
      )}

      {blocks.map((b) => (
        <section key={b.id} className="space-y-2">
          <h2 className="section-title">
            {b.name}{" "}
            <span className="font-sans text-sm font-normal text-muted">
              {plural(b.guests.length, "aanwezig", "aanwezig")}, waarvan {plural(b.guests.filter((g) => g.is_kid).length, "kind", "kinderen")}
            </span>
          </h2>
          {table(b.guests)}
        </section>
      ))}

      {declined.length > 0 && (
        <details className="space-y-2">
          <summary className="cursor-pointer section-title">Afgemeld ({declined.length})</summary>
          <div className="mt-2">{table(declined)}</div>
        </details>
      )}

      {isAdmin && (
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-medium text-bordeaux">+ Gast handmatig toevoegen</summary>
          <p className="mt-2 mb-3 text-xs text-muted">Bijvoorbeeld bij een telefonische aanmelding. Krijgt het label &quot;Handmatig toegevoegd&quot;, telt overal mee en krijgt geen bevestigingsmail.</p>
          <GuestForm coupleId={couple.id} groups={groups} />
        </details>
      )}
    </div>
  );
}
