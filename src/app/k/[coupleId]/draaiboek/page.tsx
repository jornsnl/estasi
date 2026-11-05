import Link from "next/link";
import { saveGuestCounts, saveRunsheet, saveRunsheetTab } from "@/app/actions/ws-fase2";
import { DirtyGuard } from "@/components/DirtyGuard";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { requireCouple } from "@/lib/ws/access";
import { rowsFor, sortSchedule, supplierContacts, tabsFor } from "@/lib/ws/runsheet";
import { SUPPLIER_STATUS } from "@/lib/ws/suppliers";

export const metadata = { title: "Draaiboek" };

const SCHEDULE_COLUMNS = [
  ["atTime", "Tijd", "w-20"],
  ["who", "Wie", ""],
  ["what", "Wat", ""],
  ["info", "Meer info", ""],
  ["location", "Waar", ""],
  ["rainLocation", "Waar (regen)", ""],
] as const;
const LIST_COLUMNS = [
  ["what", "Wat", ""],
  ["who", "Wie", ""],
  ["info", "Meer info", ""],
] as const;
const DB = { atTime: "at_time", who: "who", what: "what", info: "info", location: "location", rainLocation: "rain_location" } as const;

export default async function RunSheet({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple, isAdmin } = await requireCouple(coupleId);
  const base = `/k/${couple.id}/draaiboek`;
  const [tabs, rows, suppliers] = await Promise.all([tabsFor(couple.id), rowsFor(couple.id), supplierContacts(couple.id)]);
  const wanted = (await searchParams).tab;
  const showSuppliers = wanted === "leveranciers";
  const tab = showSuppliers ? null : (tabs.find((t) => t.id === wanted) ?? tabs[0] ?? null);
  const columns = tab?.kind === "schedule" ? SCHEDULE_COLUMNS : LIST_COLUMNS;
  const tabRows = tab ? (tab.kind === "schedule" ? sortSchedule(rows.filter((r) => r.tab_id === tab.id)) : rows.filter((r) => r.tab_id === tab.id)) : [];
  const grid = tab?.kind === "schedule" ? "sm:grid-cols-[5rem_1fr_1.3fr_1.3fr_1fr_1fr_auto]" : "sm:grid-cols-[1.4fr_1fr_1.6fr_auto]";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Onderdeel</p>
          <h1 className="mt-1 text-3xl">Draaiboek</h1>
          <p className="mt-1 text-sm text-muted">Het verloop van de dag. Jullie en Sabine kunnen allebei regels toevoegen.</p>
        </div>
        <Link href={`${base}/print`} className="btn-secondary">Printversie</Link>
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
          <Link key={t.id} href={`${base}?tab=${t.id}`} aria-current={tab?.id === t.id ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 text-sm ${tab?.id === t.id ? "bg-bordeaux text-white" : "bg-white hover:bg-cream-deep"}`}>{t.title}</Link>
        ))}
        <Link href={`${base}?tab=leveranciers`} aria-current={showSuppliers ? "page" : undefined}
          className={`rounded-full px-3.5 py-1.5 text-sm ${showSuppliers ? "bg-bordeaux text-white" : "bg-white hover:bg-cream-deep"}`}>Leveranciers</Link>
      </nav>

      {showSuppliers && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="table-head"><tr><th className="px-4 py-2.5">Categorie</th><th className="px-4 py-2.5">Leverancier</th><th className="px-4 py-2.5">Contactpersoon</th><th className="px-4 py-2.5">Telefoon</th><th className="px-4 py-2.5">E-mail</th></tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.category_id} className="border-t border-line">
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
            Dit tabblad vult zich vanzelf vanuit <Link className="text-bordeaux" href={`/k/${couple.id}/leveranciers`}>Jullie leveranciers</Link>.
          </p>
        </div>
      )}

      {tab && (
        <form id="runsheet" action={saveRunsheet} className="card space-y-2 p-4">
          <input type="hidden" name="coupleId" value={couple.id} />
          <input type="hidden" name="tabId" value={tab.id} />
          {/* First submit button: Enter in a field saves and never deletes a row. */}
          <button type="submit" name="intent" value="save" tabIndex={-1} aria-hidden="true" className="absolute h-0 w-0 overflow-hidden opacity-0" />
          <div className={`hidden gap-2 px-1 text-xs font-medium text-bordeaux sm:grid ${grid}`}>
            {columns.map(([, label]) => <span key={label}>{label}</span>)}
            <span />
          </div>
          {tabRows.map((r) => (
            <div key={r.id} className={`grid gap-2 rounded-xl bg-cream/60 p-2 sm:bg-transparent sm:p-0 ${grid}`}>
              {columns.map(([field, label]) => (
                <input key={field} name={`r-${r.id}-${field}`} defaultValue={r[DB[field]]} aria-label={label} placeholder={label} className="input py-1.5 text-sm" />
              ))}
              <SubmitButton name="intent" value={`delete:${r.id}`} className="btn-ghost px-2 py-1 text-xs text-bordeaux" confirm="Deze regel verwijderen? Je andere wijzigingen worden opgeslagen.">
                Verwijderen
              </SubmitButton>
            </div>
          ))}
          {tabRows.length === 0 && <p className="px-1 py-2 text-sm text-muted">Nog geen regels in dit tabblad.</p>}
          <div className={`grid gap-2 border-t border-line pt-3 ${grid}`}>
            {columns.map(([field, label]) => (
              <input key={field} name={`new-${field}`} aria-label={`Nieuw: ${label}`} placeholder={field === "atTime" ? "8:30" : label} className="input py-1.5 text-sm" />
            ))}
            <SubmitButton name="intent" value="save" className="btn-secondary px-3 py-1.5 text-xs">+ Toevoegen</SubmitButton>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-4 pt-2">
            <DirtyGuard formId="runsheet" />
            <SubmitButton name="intent" value="save" className="btn-primary" pendingText="Opslaan…">Opslaan</SubmitButton>
          </div>
        </form>
      )}

      {isAdmin && (
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-medium text-bordeaux">Tabbladen beheren</summary>
          <div className="mt-3 space-y-2">
            {tabs.map((t) => (
              <form key={t.id} action={saveRunsheetTab} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="coupleId" value={couple.id} />
                <input type="hidden" name="tabId" value={t.id} />
                <input name="title" defaultValue={t.title} aria-label="Naam tabblad" className="input max-w-xs py-1.5" />
                <span className="text-xs text-muted">{t.kind === "schedule" ? "tijdlijn" : "lijst"}</span>
                <SubmitButton className="btn-secondary py-1.5 text-xs">Hernoemen</SubmitButton>
                <SubmitButton name="intent" value="delete" className="btn-ghost py-1.5 text-xs text-bordeaux" confirm={`Tabblad "${t.title}" met alle regels verwijderen?`}>Verwijderen</SubmitButton>
              </form>
            ))}
            <form action={saveRunsheetTab} className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
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
