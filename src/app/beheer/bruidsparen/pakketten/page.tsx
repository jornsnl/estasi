import Link from "next/link";
import { archivePackage, savePackage } from "@/app/actions/ws-admin";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { query } from "@/lib/ws/db";
import { formatMoney } from "@/lib/ws/format";
import type { Package } from "@/lib/ws/types";

export const metadata = { title: "Pakketten" };

export default async function Packages({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const packages = await query<Package & { tasks: number }>(
    "select p.*, (select count(*)::int from package_tasks t where t.package_id = p.id) as tasks from packages p order by archived, position, name",
  );
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Beheer</p>
        <h1 className="mt-1 text-3xl">Pakketten</h1>
        <p className="mt-1 text-sm text-muted">Naam, prijs, richtaantal meetings en starttaken per pakket. Wijzigingen gelden voor nieuwe bruidsparen.</p>
      </header>
      <Notice searchParams={searchParams} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="table-head"><tr><th className="px-4 py-2.5">Pakket</th><th className="px-4 py-2.5 text-right">Prijs</th><th className="px-4 py-2.5 text-right">Meetings</th><th className="px-4 py-2.5 text-right">Starttaken</th><th className="px-4 py-2.5">Leveranciers</th><th className="px-4 py-2.5" /></tr></thead>
          <tbody>
            {packages.map((p) => (
              <tr key={p.id} className={`border-t border-line ${p.archived ? "opacity-50" : ""}`}>
                <td className="px-4 py-3"><Link href={`/beheer/bruidsparen/pakketten/${p.id}`} className="font-medium hover:text-bordeaux">{p.name}</Link>{p.variant && <span className="block text-xs text-muted">{p.variant}</span>}</td>
                <td className="px-4 py-3 text-right">{p.price_cents ? formatMoney(p.price_cents) : "–"}</td>
                <td className="px-4 py-3 text-right">{p.meetings}</td>
                <td className="px-4 py-3 text-right">{p.tasks}</td>
                <td className="px-4 py-3">{p.suppliers_enabled ? "Aan" : "Uit"}</td>
                <td className="px-4 py-3 text-right">
                  <form action={archivePackage}>
                    <input type="hidden" name="packageId" value={p.id} />
                    <input type="hidden" name="archived" value={p.archived ? "0" : "1"} />
                    <SubmitButton className="text-xs text-muted hover:text-bordeaux">{p.archived ? "Terugzetten" : "Archiveren"}</SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form action={savePackage} className="card grid gap-3 p-5 sm:grid-cols-6">
        <h2 className="text-lg sm:col-span-6">Nieuw pakket</h2>
        <div className="sm:col-span-3"><label className="label" htmlFor="name">Naam</label><input id="name" name="name" required className="input" /></div>
        <div className="sm:col-span-3"><label className="label" htmlFor="variant">Toevoeging (bijv. locatie)</label><input id="variant" name="variant" className="input" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="price">Prijs incl. btw (€)</label><input id="price" name="price" inputMode="decimal" className="input" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="meetings">Meetings</label><input id="meetings" name="meetings" type="number" min={0} max={20} defaultValue={3} className="input" /></div>
        <label className="flex items-end gap-2 pb-3 text-sm sm:col-span-2"><input type="checkbox" name="suppliersEnabled" defaultChecked className="accent-[#6B1E2E]" /> Met &quot;Jullie leveranciers&quot;</label>
        <div className="sm:col-span-6"><SubmitButton className="btn-primary">Pakket toevoegen</SubmitButton></div>
      </form>
    </div>
  );
}
