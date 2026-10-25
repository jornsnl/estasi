import { createStudent } from "@/app/actions/admin";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { getStore } from "@/lib/data";
import { toDateInput } from "@/lib/util/format";

export const metadata = { title: "Cursist toevoegen" };

export default async function NewStudentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const settings = await getStore().getSettings();
  return (
    <div className="max-w-2xl">
      <p className="eyebrow">Beheer</p>
      <h1 className="mt-1 text-4xl">Cursist toevoegen</h1>
      <p className="mt-2 mb-8 text-muted">
        Fase 1: na ontvangst van de betaling maak je hier het account aan. Je krijgt een activatielink die je naar de cursist stuurt; de
        cursist kiest daarmee zelf een wachtwoord. De toegang loopt 12 maanden vanaf de aankoopdatum.
      </p>
      <Notice searchParams={searchParams} />
      <form action={createStudent} className="card space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="label">Naam</label>
            <input id="name" name="name" required className="input" />
          </div>
          <div>
            <label htmlFor="email" className="label">E-mailadres</label>
            <input id="email" name="email" type="email" required className="input" />
          </div>
          <div>
            <label htmlFor="phone" className="label">Telefoon</label>
            <input id="phone" name="phone" type="tel" className="input" />
          </div>
          <div>
            <label htmlFor="city" className="label">Woonplaats</label>
            <input id="city" name="city" className="input" />
          </div>
          <div>
            <label htmlFor="companyName" className="label">Bedrijfsnaam (optioneel)</label>
            <input id="companyName" name="companyName" className="input" />
          </div>
          <div>
            <label htmlFor="purchasedAt" className="label">Aankoopdatum</label>
            <input id="purchasedAt" name="purchasedAt" type="date" defaultValue={toDateInput(new Date().toISOString())} className="input" />
          </div>
        </div>
        <fieldset>
          <legend className="label">Pakket</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="card flex cursor-pointer gap-3 p-4 has-[:checked]:border-bordeaux has-[:checked]:bg-bordeaux-soft/40">
              <input type="radio" name="package" value="A" defaultChecked className="mt-1 accent-[#722F37]" />
              <span>
                <span className="block font-medium">A · Online</span>
                <span className="text-sm text-muted">Online lessen, begeleiding en online certificaat.</span>
              </span>
            </label>
            <label className={`card flex gap-3 p-4 ${settings.practicalSpotsAvailable ? "cursor-pointer has-[:checked]:border-bordeaux has-[:checked]:bg-bordeaux-soft/40" : "opacity-60"}`}>
              <input type="radio" name="package" value="B" disabled={!settings.practicalSpotsAvailable} className="mt-1 accent-[#722F37]" />
              <span>
                <span className="block font-medium">B · Online + praktijk</span>
                <span className="text-sm text-muted">
                  {settings.practicalSpotsAvailable ? "Inclusief meeloopdag tijdens een echte bruiloft." : "Geen praktijkplekken beschikbaar (zie Instellingen)."}
                </span>
              </span>
            </label>
          </div>
        </fieldset>
        <div>
          <label htmlFor="ownerNotes" className="label">Interne notitie (optioneel)</label>
          <textarea id="ownerNotes" name="ownerNotes" rows={3} className="input" placeholder="Bijvoorbeeld factuurnummer of betaalreferentie" />
        </div>
        <SubmitButton pendingText="Aanmaken…">Cursist aanmaken</SubmitButton>
      </form>
    </div>
  );
}
