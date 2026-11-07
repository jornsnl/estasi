import Link from "next/link";
import { addGroupPhoto, addPackingItem } from "@/app/actions/ws-lists";
import { saveGuestCounts } from "@/app/actions/ws-fase2";
import { moveTab, saveTab } from "@/app/actions/ws-runsheet";
import { MoveButtons } from "@/components/MoveButtons";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { DayGuestList, GroupPhotos, PackingList } from "@/components/ws/DraaiboekLists";
import { PrintDialog } from "@/components/ws/PrintDialog";
import { RunsheetEditor } from "@/components/ws/RunsheetEditor";
import { requirePlanning } from "@/lib/ws/access";
import { dayGuests } from "@/lib/ws/dayguests";
import { query } from "@/lib/ws/db";
import { PALETTE, peopleFor, rowsFor, supplierContacts, TAB_KINDS, tabsFor } from "@/lib/ws/runsheet";
import { getSettings } from "@/lib/ws/settings";
import { SUPPLIER_STATUS } from "@/lib/ws/suppliers";
import { StylingTab } from "./StylingTab";
import { SeatingTab } from "./SeatingTab";

export const metadata = { title: "Draaiboek" };

const LISTS = [
  { kind: "wedding", title: "Inpaklijst bruiloft", intro: "" },
  { kind: "bag", title: "What's in my bag", intro: "Deze spullen nemen jullie mee en geven jullie op de dag zelf aan Sabine. Zij houdt de tas bij zich, zodat alles altijd binnen handbereik is." },
  { kind: "styling", title: "Styling meenemen", intro: "Welke stylingspullen hebben jullie thuis en nemen jullie zelf mee?" },
] as const;

export default async function RunSheet({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple, isAdmin } = await requirePlanning(coupleId);
  const base = `/k/${couple.id}/draaiboek`;
  const sp = await searchParams;
  const tabs = await tabsFor(couple.id);
  const showSuppliers = sp.tab === "leveranciers";
  const tab = showSuppliers ? null : (tabs.find((t) => t.id === sp.tab) ?? tabs.find((t) => t.kind === sp.soort) ?? tabs[0] ?? null);
  const names = [couple.partner1_first, couple.partner2_first].filter(Boolean).join(" & ");

  const pill = (active: boolean) => `rounded-full px-3.5 py-1.5 text-sm ${active ? "bg-bordeaux text-white" : "bg-white hover:bg-cream-deep"}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Onderdeel</p>
          <h1 className="mt-1 text-3xl">Draaiboek</h1>
          <p className="mt-1 text-sm text-muted">Het verloop van de dag. Jullie en Sabine kunnen allebei regels toevoegen.</p>
        </div>
        <PrintDialog
          href={`${base}/print`}
          tabs={[...tabs.map((t) => ({ key: t.id, title: t.title })), { key: "leveranciers", title: "Leveranciers" }]}
        />
      </header>
      <Notice searchParams={searchParams} />

      <form action={saveGuestCounts} className="flex flex-wrap items-end gap-3 rounded-2xl bg-ink p-4 text-cream">
        <input type="hidden" name="coupleId" value={couple.id} />
        <p className="w-full text-sm sm:w-auto sm:pb-2">Verwachte gasten:</p>
        <label className="text-xs">Overdag<input name="guestsDay" type="number" min={0} defaultValue={couple.guests_day ?? ""} className="input mt-1 w-24 py-1.5 text-ink" /></label>
        <label className="text-xs">waarvan kinderen<input name="guestsDayKids" type="number" min={0} defaultValue={couple.guests_day_kids ?? ""} className="input mt-1 w-24 py-1.5 text-ink" /></label>
        <label className="text-xs">&apos;s Avonds<input name="guestsEvening" type="number" min={0} defaultValue={couple.guests_evening ?? ""} className="input mt-1 w-24 py-1.5 text-ink" /></label>
        <SubmitButton className="btn bg-cream py-2 text-ink hover:bg-white">Opslaan</SubmitButton>
      </form>

      <nav aria-label="Tabbladen" className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <Link key={t.id} href={`${base}?tab=${t.id}`} aria-current={tab?.id === t.id ? "page" : undefined} className={pill(tab?.id === t.id)}>{t.title}</Link>
        ))}
        <Link href={`${base}?tab=leveranciers`} aria-current={showSuppliers ? "page" : undefined} className={pill(showSuppliers)}>Leveranciers</Link>
      </nav>

      {showSuppliers && <SuppliersTab coupleId={couple.id} />}

      {tab && (tab.kind === "schedule" || tab.kind === "list") && (
        <ScheduleTab coupleId={couple.id} tabId={tab.id} kind={tab.kind} isAdmin={isAdmin} />
      )}

      {tab?.kind === "packing" && (
        <div className="space-y-8">
          {await Promise.all(
            LISTS.map(async (list) => {
              const items = await query<{ id: string; what: string; who: string; packed: boolean; is_default: boolean }>(
                "select id, what, who, packed, is_default from packing_items where couple_id = $1 and list_kind = $2 order by position, created_at",
                [couple.id, list.kind],
              );
              const fromStyling = list.kind === "styling" ? await stylingCarried(couple.id, [couple.partner1_first, couple.partner2_first]) : [];
              return (
                <section key={list.kind} id={`lijst-${list.kind}`} className="scroll-mt-6 space-y-2">
                  <h2 className="section-title">{list.title}</h2>
                  {list.intro && <p className="text-sm text-muted">{list.intro}</p>}
                  <PackingList coupleId={couple.id} isAdmin={isAdmin} items={[...fromStyling, ...items]} />
                  <form action={addPackingItem} className="flex flex-wrap gap-2">
                    <input type="hidden" name="coupleId" value={couple.id} />
                    <input type="hidden" name="listKind" value={list.kind} />
                    <input name="what" required placeholder="Wat moet er mee?" aria-label={`Nieuw item voor ${list.title}`} className="input min-w-48 flex-1 py-1.5" />
                    <input name="who" defaultValue={names} aria-label="Wie neemt het mee" className="input w-48 py-1.5" />
                    <SubmitButton className="btn-secondary py-1.5">Toevoegen</SubmitButton>
                  </form>
                </section>
              );
            }),
          )}
        </div>
      )}

      {tab?.kind === "photos" && <PhotosTab coupleId={couple.id} isAdmin={isAdmin} printHref={`${base}/print?tabs=${tab.id}&print=1`} />}

      {tab?.kind === "guests" && <GuestsTab coupleId={couple.id} isAdmin={isAdmin} />}

      {tab?.kind === "styling" && <StylingTab coupleId={couple.id} isAdmin={isAdmin} />}

      {tab?.kind === "seating" && <SeatingTab coupleId={couple.id} isAdmin={isAdmin} />}

      {isAdmin && (
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-medium text-bordeaux">Tabbladen beheren</summary>
          <p className="mt-2 text-xs text-muted">Alleen jij ziet dit. Het bruidspaar kan geen tabbladen toevoegen, hernoemen, verplaatsen of verwijderen.</p>
          <div className="mt-3 space-y-2">
            {tabs.map((t, i) => (
              <div key={t.id} className="flex flex-wrap items-center gap-2">
                <form action={saveTab} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="coupleId" value={couple.id} />
                  <input type="hidden" name="tabId" value={t.id} />
                  <input name="title" defaultValue={t.title} aria-label="Naam tabblad" className="input max-w-xs py-1.5" />
                  <span className="text-xs text-muted">{TAB_KINDS[t.kind]}</span>
                  <SubmitButton className="btn-secondary py-1.5 text-xs">Hernoemen</SubmitButton>
                  <SubmitButton name="intent" value="delete" className="btn-ghost py-1.5 text-xs text-bordeaux" confirm={`Tabblad "${t.title}" verwijderen?`}>Verwijderen</SubmitButton>
                </form>
                <MoveButtons action={moveTab} id={t.id} first={i === 0} last={i === tabs.length - 1} extra={{ coupleId: couple.id }} />
              </div>
            ))}
            <form action={saveTab} className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <input type="hidden" name="coupleId" value={couple.id} />
              <input name="title" required placeholder="Nieuw tabblad" aria-label="Nieuw tabblad" className="input max-w-xs py-1.5" />
              <select name="kind" aria-label="Soort" className="input w-auto py-1.5"><option value="list">Lijst</option><option value="schedule">Tijdlijn</option></select>
              <SubmitButton className="btn-primary py-1.5 text-xs">Toevoegen</SubmitButton>
            </form>
          </div>
        </details>
      )}
    </div>
  );
}

async function ScheduleTab({ coupleId, tabId, kind, isAdmin }: { coupleId: string; tabId: string; kind: "schedule" | "list"; isAdmin: boolean }) {
  const [rows, people] = await Promise.all([rowsFor(coupleId, tabId), peopleFor(coupleId)]);
  return (
    <RunsheetEditor
      key={tabId}
      coupleId={coupleId}
      tabId={tabId}
      kind={kind}
      isAdmin={isAdmin}
      palette={PALETTE}
      initialPeople={people}
      initialRows={rows.map((r) => ({
        id: r.id, at_time: r.at_time, people: r.people?.length ? r.people : r.who ? [r.who] : [], what: r.what, info: r.info,
        location: r.location, rain_location: r.rain_location, by_admin: r.by_admin, created_by_name: r.created_by_name,
      }))}
    />
  );
}

async function PhotosTab({ coupleId, isAdmin, printHref }: { coupleId: string; isAdmin: boolean; printHref: string }) {
  const [settings, photos] = await Promise.all([
    getSettings(),
    query<{ id: string; who: string; location: string; done: boolean }>("select id, who, location, done from group_photos where couple_id = $1 order by position, created_at", [coupleId]),
  ]);
  const [title, ...body] = (settings.group_photo_intro ?? "").split("\n\n");
  return (
    <div className="space-y-4">
      {settings.group_photo_intro && (
        <details className="rounded-2xl bg-cream-deep/70 p-5" open={photos.length === 0}>
          <summary className="cursor-pointer font-serif text-lg font-semibold">{title}</summary>
          <div className="mt-2 space-y-2 text-sm leading-6 text-ink/80">{body.map((p, i) => <p key={i}>{p}</p>)}</div>
        </details>
      )}
      <GroupPhotos coupleId={coupleId} isAdmin={isAdmin} photos={photos} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form action={addGroupPhoto} className="flex flex-1 flex-wrap gap-2">
          <input type="hidden" name="coupleId" value={coupleId} />
          <input name="who" required placeholder="Wie staan erop, bijvoorbeeld: bruidspaar met ouders" aria-label="Wie staan erop" className="input min-w-56 flex-1 py-1.5" />
          <input name="location" placeholder="Locatie" aria-label="Locatie" className="input w-40 py-1.5" />
          <SubmitButton className="btn-secondary py-1.5">Foto toevoegen</SubmitButton>
        </form>
        <a href={printHref} target="_blank" rel="noopener" className="btn-secondary py-1.5">PDF voor de fotograaf</a>
      </div>
    </div>
  );
}

async function GuestsTab({ coupleId, isAdmin }: { coupleId: string; isAdmin: boolean }) {
  const { groups, guests } = await dayGuests(coupleId);
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">
        Vult zich vanzelf met iedereen die zich via de RSVP aanmeldt. Namen, nummers en allergieën wijzig je via <Link href={`/k/${coupleId}/gasten`} className="text-bordeaux underline">Gastenlijst & RSVP</Link>; de relatie kun je hier verfijnen en met ★ markeer je belangrijke personen.
      </p>
      <DayGuestList coupleId={coupleId} isAdmin={isAdmin} groups={groups} guests={guests} />
    </div>
  );
}

async function SuppliersTab({ coupleId }: { coupleId: string }) {
  const suppliers = await supplierContacts(coupleId);
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="table-head"><tr><th className="px-4 py-2.5">Categorie</th><th className="px-4 py-2.5">Leverancier</th><th className="px-4 py-2.5">Contactpersoon</th><th className="px-4 py-2.5">Telefoon</th><th className="px-4 py-2.5">E-mail</th></tr></thead>
        <tbody>
          {suppliers.map((s) => (
            <tr key={s.id} className="border-t border-line">
              <td className="px-4 py-2.5">{s.category_name}<span className="block text-xs text-muted">{SUPPLIER_STATUS[s.status]}</span></td>
              <td className="px-4 py-2.5">{s.name || "–"}</td>
              <td className="px-4 py-2.5">{s.contact_person || "–"}</td>
              <td className="px-4 py-2.5">{s.phone ? <a className="text-bordeaux" href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a> : "–"}</td>
              <td className="px-4 py-2.5">{s.email ? <a className="text-bordeaux" href={`mailto:${s.email}`}>{s.email}</a> : "–"}</td>
            </tr>
          ))}
          {suppliers.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">Nog geen leveranciers met contactgegevens.</td></tr>}
        </tbody>
      </table>
      <p className="border-t border-line px-4 py-3 text-xs text-muted">
        Dit tabblad vult zich vanzelf vanuit <Link className="text-bordeaux" href={`/k/${coupleId}/leveranciers`}>Jullie leveranciers</Link>.
      </p>
    </div>
  );
}

/** Styling items the couple arranges themselves ("Wie regelt het" is one of their names). Filled in by the styling plan. */
async function stylingCarried(coupleId: string, partners: string[]) {
  const names = partners.filter(Boolean).map((n) => n.toLowerCase());
  if (names.length === 0) return [];
  const exists = await query<{ ok: boolean }>("select to_regclass('wedding_space.styling_items') is not null as ok");
  if (!exists[0]?.ok) return [];
  const rows = await query<{ id: string; what: string; who: string }>(
    `select i.id, i.what, i.who from styling_items i where i.couple_id = $1 and i.who <> ''
      order by i.position`,
    [coupleId],
  );
  return rows
    .filter((r) => r.who.toLowerCase().split(/\s*(?:,|&|\ben\b)\s*/).some((w) => names.includes(w.trim())))
    .map((r) => ({ id: `s-${r.id}`, what: r.what, who: r.who, packed: false, is_default: true, fromStyling: true }));
}
