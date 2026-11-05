import { createCoupleAction } from "@/app/actions/admin";
import { CoupleFields } from "@/components/CoupleFields";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { query } from "@/lib/db";
import { formatMoney } from "@/lib/domain/format";
import type { Package } from "@/lib/types";

export const metadata = { title: "Nieuw bruidspaar" };

export default async function NewCouple({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const packages = await query<Package>("select * from packages where not archived order by position, name");
  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <p className="eyebrow">Beheer</p>
        <h1 className="mt-1 text-3xl">Nieuw bruidspaar</h1>
        <p className="mt-1 text-sm text-muted">
          Het portaal wordt meteen aangemaakt, met de starttaken en meetings van het pakket. Het bruidspaar ziet nog niets totdat jij op &quot;Maak beschikbaar en deel&quot; klikt.
        </p>
      </header>
      <Notice searchParams={searchParams} />
      <form action={createCoupleAction} className="card space-y-8 p-6">
        <CoupleFields />
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-2 font-serif text-lg font-semibold">Pakket</legend>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="packageId">Gekozen pakket</label>
            <select id="packageId" name="packageId" className="input" defaultValue="">
              <option value="">Nog geen pakket</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.variant ? ` (${p.variant})` : ""} · {p.meetings} meeting{p.meetings === 1 ? "" : "s"}{p.price_cents ? ` · ${formatMoney(p.price_cents)}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="meetings">Aantal meetings</label>
            <input id="meetings" name="meetings" type="number" min={0} max={20} placeholder="Zoals het pakket" className="input" />
            <p className="hint">Leeg laten = het aantal van het pakket.</p>
          </div>
        </fieldset>
        <SubmitButton className="btn-primary" pendingText="Aanmaken…">Portaal aanmaken</SubmitButton>
      </form>
    </div>
  );
}
