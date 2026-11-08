import { addInvitation, importInvitations } from "@/app/actions/ws-invitations";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { GuestTabs } from "@/components/ws/GuestTabs";
import { ChildrenFields, InvitationTable } from "@/components/ws/InvitationTable";
import { requirePlanning } from "@/lib/ws/access";
import { invitationTotals } from "@/lib/ws/guest-counts";
import { invitationsFor, syncInvitationChildren } from "@/lib/ws/invitations";
import { groupsOf } from "@/lib/ws/rsvp";

export const metadata = { title: "Uitnodigingslijst" };

export default async function InvitationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple } = await requirePlanning(coupleId);
  await syncInvitationChildren(couple.id);
  const [rows, groups] = await Promise.all([invitationsFor(couple.id), groupsOf(couple.id)]);
  const totals = invitationTotals(rows.map((r) => ({ party_size: r.party_size, kids: r.children.length, group_id: r.group_id })), groups);

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <p className="eyebrow">Onderdeel</p>
          <h1 className="mt-1 text-3xl">Gastenlijst & RSVP</h1>
          <p className="mt-1 text-sm text-muted">
            Wie krijgt een kaart? Eén regel per huishouden. &quot;Gereageerd&quot; gaat vanzelf op ja zodra iemand uit het huishouden het RSVP-formulier invult. Adressen en e-mailadressen zien alleen jullie en Sabine.
          </p>
        </div>
        <GuestTabs coupleId={couple.id} current="uitnodigingen" />
      </header>
      <Notice searchParams={searchParams} />

      {totals.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Totalen uitgenodigd">
          {totals.map((t) => (
            <div key={t.id || "none"} className="card p-4">
              <p className="text-sm text-muted">{t.name}</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-4 font-serif">
                <span><span className="text-3xl">{t.adults}</span> <span className="font-sans text-sm text-muted">{t.adults === 1 ? "volwassene" : "volwassenen"}</span></span>
                <span><span className="text-3xl">{t.kids}</span> <span className="font-sans text-sm text-muted">{t.kids === 1 ? "kind" : "kinderen"}</span></span>
              </p>
            </div>
          ))}
        </section>
      )}

      <InvitationTable
        coupleId={couple.id}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        rows={rows.map((r) => ({
          id: r.id, names: r.names, party_size: r.party_size, group_id: r.group_id, address: r.address, email: r.email,
          send_via: r.send_via, sent: r.sent, responded: r.responded, match_id: r.match_id, candidate: r.candidate, children: r.children,
        }))}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <form action={addInvitation} className="card grid gap-2 p-5 sm:grid-cols-2">
          <input type="hidden" name="coupleId" value={couple.id} />
          <h2 className="text-lg sm:col-span-2">Huishouden toevoegen</h2>
          <input name="names" required placeholder="Namen, bijvoorbeeld Jan & Els de Vries" aria-label="Namen" className="input sm:col-span-2" />
          <label className="text-sm">Aantal personen (inclusief kinderen)<input name="partySize" type="number" min={1} max={50} defaultValue={2} className="input mt-0.5" /></label>
          <label className="text-sm">Gastengroep<select name="groupId" className="input mt-0.5">
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select></label>
          <ChildrenFields />
          <input name="address" placeholder="Adres" aria-label="Adres" className="input sm:col-span-2" />
          <input name="email" type="email" placeholder="E-mail" aria-label="E-mail" className="input" />
          <select name="sendVia" aria-label="Kaart versturen via" className="input"><option value="post">Kaart per post</option><option value="mail">Kaart per mail</option></select>
          <div className="sm:col-span-2"><SubmitButton className="btn-primary">Toevoegen</SubmitButton></div>
        </form>

        <div className="card space-y-3 p-5">
          <h2 className="text-lg">Importeren en downloaden</h2>
          <form action={importInvitations} className="space-y-2">
            <input type="hidden" name="coupleId" value={couple.id} />
            <p className="text-sm text-muted">Een Excel-bestand (.xlsx) of CSV met op de eerste regel de kolomnamen, bijvoorbeeld: Namen, Aantal, Groep, Adres, E-mail, Versturen via.</p>
            <input type="file" name="file" accept=".xlsx,.csv" required aria-label="Excel-bestand" className="block text-sm file:mr-3 file:rounded-full file:border-0 file:bg-bordeaux file:px-4 file:py-1.5 file:font-semibold file:text-white" />
            <SubmitButton className="btn-secondary" pendingText="Importeren…">Importeren uit Excel</SubmitButton>
          </form>
          <a href={`/api/ws-uitnodigingen/${couple.id}`} className="btn-secondary inline-block">Adressen downloaden als Excel</a>
        </div>
      </div>
    </div>
  );
}
