import Link from "next/link";
import { archivePackage, savePackage } from "@/app/actions/ws-admin";
import { deletePackage, moveAnyPackage } from "@/app/actions/ws-packages";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { SortableRows } from "@/components/ws/SortableRows";
import { query } from "@/lib/ws/db";
import { formatMoney } from "@/lib/ws/format";
import type { Package } from "@/lib/ws/types";

export const metadata = { title: "Pakketten" };

const KIND = { wp: "Weddingplanner", cm: "Ceremoniemeester", od: "Openingsdans" } as const;

export default async function Packages({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const packages = await query<Package & { tasks: number; couples: number }>(
    `select p.*, (select count(*)::int from package_tasks t where t.package_id = p.id) as tasks,
            (select count(*)::int from couple_packages cp where cp.package_id = p.id) as couples
       from packages p order by archived, position, name, id`,
  );
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Beheer</p>
        <h1 className="mt-1 text-3xl">Pakketten</h1>
        <p className="mt-1 text-sm text-muted">
          Naam, prijs, richtaantal meetings en starttaken per pakket. Wijzigingen gelden voor nieuwe bruidsparen. Sleep aan de greep of gebruik de pijlen om de volgorde te
          veranderen; die wordt direct opgeslagen en geldt overal (keuzelijsten, &quot;Jullie pakket&quot; en de openingsdanspagina).
        </p>
      </header>
      <Notice searchParams={searchParams} />
      <div className="card">
        <SortableRows
          label="Pakketten"
          move={moveAnyPackage}
          rows={packages.map((p) => ({
            id: p.id,
            dimmed: p.archived,
            node: (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                <div className="min-w-0">
                  <Link href={`/beheer/bruidsparen/pakketten/${p.id}`} className="font-medium hover:text-bordeaux">{p.name}</Link>
                  {p.archived && <span className="ml-2 rounded-full bg-cream-deep px-1.5 text-xs text-muted">verborgen</span>}
                  <span className="block text-xs text-muted">
                    {KIND[p.kind]}{p.variant ? ` · ${p.variant}` : ""} · {p.price_cents ? formatMoney(p.price_cents) : "geen prijs"} · {p.meetings} meetings · {p.tasks} starttaken
                    · leveranciers {p.suppliers_enabled ? "aan" : "uit"} · {p.couples === 1 ? "1 bruidspaar" : `${p.couples} bruidsparen`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <form action={archivePackage}>
                    <input type="hidden" name="packageId" value={p.id} />
                    <input type="hidden" name="archived" value={p.archived ? "0" : "1"} />
                    <SubmitButton className="text-xs text-muted hover:text-bordeaux">{p.archived ? "Zichtbaar maken" : "Verbergen"}</SubmitButton>
                  </form>
                  {p.couples === 0 ? (
                    <form action={deletePackage}>
                      <input type="hidden" name="packageId" value={p.id} />
                      <SubmitButton className="text-xs text-muted hover:text-bordeaux" confirm={`"${p.name}" definitief verwijderen?`}>Verwijderen</SubmitButton>
                    </form>
                  ) : (
                    <span className="text-xs text-muted/70" title="Gekoppeld aan een bruidspaar: verbergen kan wel">Niet te verwijderen</span>
                  )}
                </div>
              </div>
            ),
          }))}
        />
        {packages.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">Nog geen pakketten.</p>}
      </div>
      <form action={savePackage} className="card grid gap-3 p-5 sm:grid-cols-6">
        <h2 className="text-lg sm:col-span-6">Nieuw pakket</h2>
        <div className="sm:col-span-3"><label className="label" htmlFor="name">Naam</label><input id="name" name="name" required className="input" /></div>
        <div className="sm:col-span-3"><label className="label" htmlFor="variant">Toevoeging (bijv. locatie)</label><input id="variant" name="variant" className="input" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="price">Prijs incl. btw (€)</label><input id="price" name="price" inputMode="decimal" className="input" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="meetings">Meetings</label><input id="meetings" name="meetings" type="number" min={0} max={20} defaultValue={3} className="input" /></div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="kind">Soort</label>
          <select id="kind" name="kind" defaultValue="wp" className="input">
            <option value="wp">Weddingplanner</option>
            <option value="cm">Ceremoniemeester</option>
            <option value="od">Openingsdans</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-6"><input type="checkbox" name="suppliersEnabled" defaultChecked className="accent-[#6B1E2E]" /> Met &quot;Jullie leveranciers&quot;</label>
        <div className="sm:col-span-6"><SubmitButton className="btn-primary">Pakket toevoegen</SubmitButton></div>
      </form>
    </div>
  );
}
