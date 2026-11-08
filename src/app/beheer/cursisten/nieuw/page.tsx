import { LIMITS } from "@/lib/domain/input";
import { ACCESS_MONTHS, ACCESS_TERM_MONTHS } from "@/lib/domain/access";
import { PACKAGE_LABELS, plural } from "@/lib/domain/labels";
import { createStudent } from "@/app/actions/admin";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { getStore } from "@/lib/data";
import { toDateInput } from "@/lib/util/format";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { generateTemporaryPassword } from "@/lib/auth/temporary-password";

export const metadata = { title: "Cursist toevoegen" };

export default async function NewStudentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const settings = await getStore().getSettings();
  return (
    <div className="max-w-2xl">
      <p className="eyebrow">Beheer</p>
      <h1 className="mt-1 text-4xl">Cursist toevoegen</h1>
      <p className="mt-2 mb-8 text-muted">
        Na ontvangst van de betaling maak je hier het account aan. Kies of de cursist een uitnodiging per mail krijgt en zelf een wachtwoord
        kiest, of dat je zelf een wachtwoord instelt en dat doorgeeft (er gaat dan geen mail). De toegang loopt standaard 12 maanden vanaf de aankoopdatum; dat kun je hieronder aanpassen en later altijd verlengen.
      </p>
      <Notice searchParams={searchParams} />
      <form action={createStudent} className="card space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="label">Naam</label>
            <input id="name" name="name" required maxLength={LIMITS.name} className="input" />
          </div>
          <div>
            <label htmlFor="email" className="label">E-mailadres</label>
            <input id="email" name="email" type="email" required maxLength={LIMITS.email} className="input" />
          </div>
          <div>
            <label htmlFor="phone" className="label">Telefoon</label>
            <input id="phone" name="phone" type="tel" maxLength={LIMITS.phone} className="input" />
          </div>
          <div>
            <label htmlFor="city" className="label">Woonplaats</label>
            <input id="city" name="city" maxLength={LIMITS.city} className="input" />
          </div>
          <div>
            <label htmlFor="companyName" className="label">Bedrijfsnaam (optioneel)</label>
            <input id="companyName" name="companyName" maxLength={LIMITS.companyName} className="input" />
          </div>
          <div>
            <label htmlFor="purchasedAt" className="label">Aankoopdatum</label>
            <input id="purchasedAt" name="purchasedAt" type="date" defaultValue={toDateInput(new Date().toISOString())} className="input" />
          </div>
          <div>
            <label htmlFor="accessMonths" className="label">Toegangstermijn</label>
            <select id="accessMonths" name="accessMonths" defaultValue={ACCESS_MONTHS} className="input">
              {ACCESS_TERM_MONTHS.map((m) => (
                <option key={m} value={m}>{plural(m, "maand", "maanden")}{m === ACCESS_MONTHS ? " (standaard)" : ""}</option>
              ))}
            </select>
            <p className="hint">De einddatum is de aankoopdatum plus deze termijn.</p>
          </div>
        </div>
        <fieldset>
          <legend className="label">Pakket</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="card flex cursor-pointer gap-3 p-4 has-[:checked]:border-bordeaux has-[:checked]:bg-bordeaux-soft/40">
              <input type="radio" name="package" value="A" defaultChecked className="mt-1 accent-[#722F37]" />
              <span>
                <span className="block font-medium">A · {PACKAGE_LABELS.A}</span>
                <span className="text-sm text-muted">Online lessen, begeleiding en online certificaat.</span>
              </span>
            </label>
            <label className={`card flex gap-3 p-4 ${settings.practicalSpotsAvailable ? "cursor-pointer has-[:checked]:border-bordeaux has-[:checked]:bg-bordeaux-soft/40" : "opacity-60"}`}>
              <input type="radio" name="package" value="B" disabled={!settings.practicalSpotsAvailable} className="mt-1 accent-[#722F37]" />
              <span>
                <span className="block font-medium">B · {PACKAGE_LABELS.B}</span>
                <span className="text-sm text-muted">
                  {settings.practicalSpotsAvailable ? "Inclusief meeloopdag tijdens een echte bruiloft." : "Geen praktijkplekken beschikbaar (zie Instellingen)."}
                </span>
              </span>
            </label>
          </div>
        </fieldset>
        <fieldset className="group">
          <legend className="label">Inloggen</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="card flex cursor-pointer gap-3 p-4 has-[:checked]:border-bordeaux has-[:checked]:bg-bordeaux-soft/40">
              <input type="radio" name="access" value="invite" defaultChecked className="mt-1 accent-[#722F37]" />
              <span>
                <span className="block font-medium">Uitnodiging mailen</span>
                <span className="text-sm text-muted">De cursist krijgt een mail en kiest zelf een wachtwoord.</span>
              </span>
            </label>
            <label className="card flex cursor-pointer gap-3 p-4 has-[:checked]:border-bordeaux has-[:checked]:bg-bordeaux-soft/40">
              <input id="accessPassword" type="radio" name="access" value="password" className="mt-1 accent-[#722F37]" />
              <span>
                <span className="block font-medium">Zelf een wachtwoord instellen</span>
                <span className="text-sm text-muted">Er gaat geen mail. Je geeft het wachtwoord zelf door.</span>
              </span>
            </label>
          </div>
          <div className="mt-3 hidden space-y-3 rounded-lg border border-line p-4 group-has-[#accessPassword:checked]:block">
            <div>
              <label htmlFor="password" className="label">Wachtwoord</label>
              <input id="password" name="password" type="text" defaultValue={generateTemporaryPassword()} minLength={MIN_PASSWORD_LENGTH} maxLength={200} autoComplete="off" spellCheck={false} className="input font-mono" />
              <p className="hint">Voorgesteld wachtwoord; je mag het aanpassen (minimaal {MIN_PASSWORD_LENGTH} tekens). Kopieer het voordat je de cursist aanmaakt.</p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="mustChange" defaultChecked className="mt-1 accent-[#722F37]" />
              <span>De cursist kiest bij de eerste keer inloggen een eigen wachtwoord (aanbevolen)</span>
            </label>
          </div>
        </fieldset>
        <div>
          <label htmlFor="ownerNotes" className="label">Interne notitie (optioneel)</label>
          <textarea id="ownerNotes" name="ownerNotes" rows={3} maxLength={LIMITS.ownerNotes} className="input" placeholder="Bijvoorbeeld factuurnummer of betaalreferentie" />
        </div>
        <SubmitButton pendingText="Aanmaken…">Cursist aanmaken</SubmitButton>
      </form>
    </div>
  );
}
