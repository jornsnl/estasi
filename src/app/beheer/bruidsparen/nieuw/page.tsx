import { createCoupleAction } from "@/app/actions/ws-admin";
import { CoupleFields } from "@/components/ws/CoupleFields";
import { CouplePaymentFields } from "@/components/ws/CouplePaymentFields";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { query } from "@/lib/ws/db";
import { formatMoney } from "@/lib/ws/format";
import type { Package } from "@/lib/ws/types";

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
            <p className="label">Gekozen pakketten (meerdere mogelijk, bijvoorbeeld Weddingplanner + Openingsdans)</p>
            <div className="space-y-1.5">
              {packages.map((p) => (
                <label key={p.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="packageIds" value={p.id} className="mt-1 accent-[#6B1E2E]" />
                  <span>
                    {p.name}{p.variant ? ` (${p.variant})` : ""}
                    <span className="text-muted"> · {p.meetings} meeting{p.meetings === 1 ? "" : "s"}{p.price_cents ? ` · ${formatMoney(p.price_cents)}` : ""}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="meetings">Aantal meetings</label>
            <input id="meetings" name="meetings" type="number" min={0} max={20} placeholder="Zoals het pakket" className="input" />
            <p className="hint">Leeg laten = het aantal van het pakket (bij meerdere pakketten het hoogste).</p>
          </div>
        </fieldset>
        <CouplePaymentFields />
        <SubmitButton className="btn-primary" pendingText="Aanmaken…">Portaal aanmaken</SubmitButton>
      </form>
    </div>
  );
}
