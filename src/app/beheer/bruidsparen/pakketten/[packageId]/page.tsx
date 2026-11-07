import Link from "next/link";
import { notFound } from "next/navigation";
import { addPackageTask, deletePackageTask, savePackage } from "@/app/actions/ws-admin";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { isUuid, one, query } from "@/lib/ws/db";
import { LANE_LABELS, LANES } from "@/lib/ws/format";
import type { Package, PackageTask } from "@/lib/ws/types";

export const metadata = { title: "Pakket" };

export default async function PackageDetail({
  params,
  searchParams,
}: {
  params: Promise<{ packageId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { packageId } = await params;
  const pkg = isUuid(packageId) ? await one<Package>("select * from packages where id = $1", [packageId]) : null;
  if (!pkg) notFound();
  const tasks = await query<PackageTask>("select * from package_tasks where package_id = $1 order by position", [pkg.id]);

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <Link href="/beheer/bruidsparen/pakketten" className="text-sm text-muted hover:text-bordeaux">← Pakketten</Link>
        <h1 className="mt-2 text-3xl">{pkg.name}</h1>
      </header>
      <Notice searchParams={searchParams} />

      <form action={savePackage} className="card grid gap-3 p-5 sm:grid-cols-6">
        <input type="hidden" name="packageId" value={pkg.id} />
        <div className="sm:col-span-3"><label className="label" htmlFor="name">Naam</label><input id="name" name="name" required defaultValue={pkg.name} className="input" /></div>
        <div className="sm:col-span-3"><label className="label" htmlFor="variant">Toevoeging</label><input id="variant" name="variant" defaultValue={pkg.variant} className="input" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="price">Prijs incl. btw (€)</label><input id="price" name="price" inputMode="decimal" defaultValue={pkg.price_cents ? (pkg.price_cents / 100).toFixed(2).replace(".", ",") : ""} className="input" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="meetings">Meetings (richtaantal)</label><input id="meetings" name="meetings" type="number" min={0} max={20} defaultValue={pkg.meetings} className="input" /></div>
        <div className="sm:col-span-3">
          <label className="label" htmlFor="kind">Soort pakket (bepaalt wat het bruidspaar ziet)</label>
          <select id="kind" name="kind" defaultValue={pkg.kind} className="input">
            <option value="wp">Weddingplanner: alles, met draaiboek</option>
            <option value="cm">Ceremoniemeester: alles, met draaiboek</option>
            <option value="od">Openingsdans: alleen overzicht, afspraken, de openingsdans en facturen</option>
          </select>
        </div>
        <label className="flex items-end gap-2 pb-3 text-sm sm:col-span-3"><input type="checkbox" name="suppliersEnabled" defaultChecked={pkg.suppliers_enabled} className="accent-[#6B1E2E]" /> Met &quot;Jullie leveranciers&quot;</label>
        <div className="sm:col-span-6">
          <label className="label" htmlFor="description">Omschrijving (zichtbaar bij &quot;Jullie Pakket&quot;)</label>
          <textarea id="description" name="description" rows={5} defaultValue={pkg.description} className="input" />
        </div>
        <div className="sm:col-span-6"><SubmitButton className="btn-primary">Opslaan</SubmitButton></div>
      </form>

      <section id="starttaken" className="scroll-mt-6">
        <h2 className="section-title mb-1">Starttaken</h2>
        <p className="mb-3 text-sm text-muted">Deze taken staan klaar op het bord van elk nieuw bruidspaar met dit pakket.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LANES.map((lane) => (
            <div key={lane} className="rounded-xl bg-cream-deep/70 p-2.5">
              <h3 className="mb-2 px-1 font-sans text-sm font-medium text-bordeaux">{LANE_LABELS[lane]}</h3>
              <ul className="space-y-1.5">
                {tasks.filter((t) => t.lane === lane).map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-2 rounded-lg bg-white p-2 text-sm">
                    <span>{t.title}</span>
                    <form action={deletePackageTask}>
                      <input type="hidden" name="packageId" value={pkg.id} />
                      <input type="hidden" name="taskId" value={t.id} />
                      <SubmitButton className="text-xs text-muted hover:text-bordeaux" confirm={`"${t.title}" verwijderen?`}>×</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
              <form action={addPackageTask} className="mt-2 flex gap-1">
                <input type="hidden" name="packageId" value={pkg.id} />
                <input type="hidden" name="lane" value={lane} />
                <input name="title" required placeholder="Nieuwe taak" aria-label={`Starttaak voor ${LANE_LABELS[lane]}`} className="input py-1.5 text-sm" />
                <SubmitButton className="btn-secondary px-2.5 py-1.5">+</SubmitButton>
              </form>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
