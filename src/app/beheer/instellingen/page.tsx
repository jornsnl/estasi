import Link from "next/link";
import { addPracticalSpotAction, removePracticalSpotAction, saveSettings, updatePracticalSpotAction } from "@/app/actions/content";
import { sendTestMail } from "@/app/actions/mail-test";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { Notice } from "@/components/Notice";
import { SettingsTabs } from "@/components/SettingsTabs";
import { SubmitButton } from "@/components/SubmitButton";
import { getStore } from "@/lib/data";
import { supabaseEnabled } from "@/lib/supabase/config";
import { LIMITS } from "@/lib/domain/input";
import { IMAGE_ACCEPT_ATTR } from "@/lib/uploads";
import { authClient } from "@/lib/supabase/server";
import { mailFrom, mailTransport } from "@/lib/ws/mail";
import { listPracticalSpots, type PracticalSpot } from "@/lib/practical-spots";
import { PACKAGE_LABELS } from "@/lib/domain/labels";
import { todayIso } from "@/lib/ws/format";

export const metadata = { title: "Instellingen" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const store = getStore();
  const today = todayIso();
  const [s, spots, students, enrollments] = await Promise.all([store.getSettings(), listPracticalSpots(today), store.listUsers("student"), store.listEnrollments()]);
  const packageOf = new Map(enrollments.map((e) => [e.userId, e.package]));
  // Package B students first: they are the ones who walk along.
  const studentOptions = students
    .map((u) => ({ id: u.id, label: `${u.name}${packageOf.has(u.id) ? ` (pakket ${PACKAGE_LABELS[packageOf.get(u.id)!]})` : ""}`, b: packageOf.get(u.id) === "B" }))
    .sort((a, b) => Number(b.b) - Number(a.b) || a.label.localeCompare(b.label, "nl"));
  let mfaLinked: boolean | null = null;
  if (supabaseEnabled()) {
    const { data } = await (await authClient()).auth.mfa.listFactors();
    mfaLinked = Boolean(data?.totp.some((f) => f.status === "verified"));
  }
  const transport = mailTransport();
  return (
    <div className="max-w-2xl">
      <p className="eyebrow">Beheer</p>
      <h1 className="mt-1 mb-6 text-4xl">Instellingen</h1>
      <SettingsTabs active="algemeen" />
      <Notice searchParams={searchParams} />
      {mfaLinked !== null && (
        <section className="card mb-6 p-6">
          <h2 className="text-2xl">Tweestapsverificatie</h2>
          {mfaLinked ? (
            <p className="mt-2 text-sm text-muted">Aan. Bij elke nieuwe login vragen we de code uit je authenticator app.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted">
                Uit. Aanbevolen voor het beheeraccount, omdat dit account de gegevens van alle cursisten ziet.
              </p>
              <Link href="/tweestaps?next=/beheer/instellingen" className="btn-secondary mt-4">Authenticator app koppelen</Link>
            </>
          )}
        </section>
      )}
      <form action={saveSettings} className="space-y-6">
        <section className="card space-y-4 p-6">
          <h2 className="text-2xl">Dashboard</h2>
          <p className="text-sm text-muted">
            De welkomstvideo en het welkomstbericht zijn alleen voor bruidsparen en stel je in bij{" "}
            <Link href="/beheer/rondleiding" className="text-bordeaux underline">Systeem, Rondleiding</Link>. Cursisten krijgen ze niet te zien.
          </p>
          <div className="space-y-1">
            <p className="label">Headerfoto op de hoofdpagina</p>
            {s.headerImageFileId && (
              // eslint-disable-next-line @next/next/no-img-element -- private file behind /api/bestanden
              <img src={`/api/bestanden/${s.headerImageFileId}`} alt="" className="h-28 w-full max-w-md rounded-xl border border-line object-cover" />
            )}
            <input type="file" name="headerImage" accept={IMAGE_ACCEPT_ATTR} aria-label="Headerfoto kiezen" className="text-sm" />
            {s.headerImageFileId && <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="removeHeaderImage" /> Foto weghalen</label>}
            <p className="hint">Optioneel. Zonder foto krijgt de header de kleuren van Estasi. Een brede, liggende foto werkt het mooist.</p>
          </div>
          <div>
            <label htmlFor="contactEmail" className="label">Contactadres voor cursisten</label>
            <input id="contactEmail" name="contactEmail" type="email" defaultValue={s.contactEmail} maxLength={LIMITS.contactEmail} className="input" />
            <p className="hint">Staat in het menu van elke cursist voor vragen en technische problemen.</p>
          </div>
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="text-2xl">Praktijkplekken</h2>
          <label className="flex items-center gap-3">
            <input type="checkbox" name="practicalSpotsAvailable" defaultChecked={s.practicalSpotsAvailable} className="h-4 w-4 accent-[#722F37]" />
            <span>Er zijn praktijkplekken beschikbaar (pakket B en upgrades toegestaan)</span>
          </label>
          <div>
            <label htmlFor="practicalSpotsNote" className="label">Notitie (intern)</label>
            <input id="practicalSpotsNote" name="practicalSpotsNote" defaultValue={s.practicalSpotsNote} maxLength={LIMITS.practicalSpotsNote} className="input" placeholder="Bijvoorbeeld: 2 plekken in juni" />
          </div>
          <p className="hint">
            De bruiloften zelf, met datum, bruidspaar en de gekoppelde cursist, staan <a href="#praktijkplekken" className="text-bordeaux underline">onder het formulier</a>.
          </p>
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="text-2xl">Privacy</h2>
          <div>
            <label htmlFor="answersPrivacyNotice" className="label">Uitleg boven de opdrachten</label>
            <textarea id="answersPrivacyNotice" name="answersPrivacyNotice" rows={4} defaultValue={s.answersPrivacyNotice} maxLength={LIMITS.privacyNotice} className="input" />
            <p className="hint">Cursisten zien deze tekst voordat ze antwoorden invullen.</p>
          </div>
          <div>
            <MarkdownEditor name="privacyText" label="Privacytekst op het profiel van cursisten" defaultValue={s.privacyText} rows={14} maxLength={LIMITS.privacyText} />
            <p className="hint">
              Staat onder Mijn profiel. Laat je dit leeg, dan zien cursisten de standaardtekst over wat de Academy bewaart, wie wat ziet en hoe ze inzage of
              verwijdering kunnen vragen. Zet hier bijvoorbeeld ook de bewaartermijn en waar de gegevens staan (Supabase, Resend).
            </p>
          </div>
        </section>

        <SubmitButton pendingText="Opslaan…">Instellingen opslaan</SubmitButton>
      </form>

      <section id="praktijkplekken" className="card mt-10 scroll-mt-6 space-y-4 p-6">
        <div>
          <h2 className="text-2xl">Praktijkplekken per bruiloft</h2>
          <p className="mt-1 text-sm text-muted">Per bruiloft de datum, de namen van het bruidspaar en welke cursist eraan gekoppeld is.</p>
        </div>
        {spots.length === 0 ? (
          <p className="rounded-lg bg-cream p-4 text-sm text-muted">Nog geen bruiloften toegevoegd.</p>
        ) : (
          <ul className="space-y-3">
            {spots.map((spot) => (
              <SpotRow key={spot.id} spot={spot} past={spot.wedding_date < today} students={studentOptions} />
            ))}
          </ul>
        )}
        <form action={addPracticalSpotAction} className="space-y-3 rounded-lg border border-dashed border-line p-4">
          <p className="font-medium">Bruiloft toevoegen</p>
          <SpotFields students={studentOptions} />
          <SubmitButton className="btn-secondary" pendingText="Toevoegen…">Toevoegen</SubmitButton>
        </form>
      </section>

      <section id="testmail" className="card mt-10 space-y-4 p-6">
        <h2 className="text-2xl">E-mail</h2>
        <p className="text-sm text-muted">
          {transport === "resend"
            ? "Mails gaan via Resend."
            : transport === "smtp"
              ? "Mails gaan via SMTP."
              : "Er staat geen RESEND_API_KEY ingesteld: mails komen alleen in de serverlog."}{" "}
          Afzender: <span className="text-ink">{mailFrom()}</span>
        </p>
        <form action={sendTestMail} className="space-y-4">
          <div>
            <label htmlFor="testmailTo" className="label">Testmail sturen naar</label>
            <input id="testmailTo" name="to" type="email" required autoComplete="email" maxLength={254} className="input" placeholder="naam@voorbeeld.nl" />
          </div>
          <div>
            <label htmlFor="testmailBrand" className="label">Kop van de mail</label>
            <select id="testmailBrand" name="brand" defaultValue="estasi" className="input">
              <option value="estasi">Estasi Weddings</option>
              <option value="academy">Future Weddings Academy</option>
              <option value="wedding-space">Your Wedding Space</option>
            </select>
            <p className="hint">Alle mails gebruiken hetzelfde ontwerp; alleen de naam onder het logo verschilt. De testmail komt ook in de mailgeschiedenis.</p>
          </div>
          <SubmitButton pendingText="Versturen…">Testmail versturen</SubmitButton>
        </form>
      </section>
    </div>
  );
}

type StudentOption = { id: string; label: string };

function SpotFields({ spot, students }: { spot?: PracticalSpot; students: StudentOption[] }) {
  const key = spot?.id ?? "nieuw";
  return (
    <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
      <div>
        <label className="label" htmlFor={`date-${key}`}>Datum</label>
        <input id={`date-${key}`} name="weddingDate" type="date" required defaultValue={spot?.wedding_date} className="input" />
      </div>
      <div>
        <label className="label" htmlFor={`names-${key}`}>Bruidspaar</label>
        <input id={`names-${key}`} name="coupleNames" required maxLength={200} defaultValue={spot?.couple_names} className="input" placeholder="Bijvoorbeeld: Lisa & Tom" />
      </div>
      <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`student-${key}`}>Gekoppelde cursist</label>
          <select id={`student-${key}`} name="studentId" defaultValue={spot?.student_user_id ?? ""} className="input">
            <option value="">Nog geen cursist</option>
            {spot?.student_user_id && !students.some((s) => s.id === spot.student_user_id) && (
              <option value={spot.student_user_id}>{spot.student_name ?? "Onbekende cursist"}</option>
            )}
            {students.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`note-${key}`}>Notitie (intern)</label>
          <input id={`note-${key}`} name="note" maxLength={300} defaultValue={spot?.note} className="input" placeholder="Bijvoorbeeld: locatie of tijden" />
        </div>
      </div>
    </div>
  );
}

function SpotRow({ spot, past, students }: { spot: PracticalSpot; past: boolean; students: StudentOption[] }) {
  return (
    <li className={`rounded-lg border border-line p-4 ${past ? "bg-cream/60" : "bg-white"}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          {formatDay(spot.wedding_date)} · {spot.couple_names}
          {past && <span className="ml-2 text-xs font-normal text-muted">geweest</span>}
        </p>
        <p className={`text-sm ${spot.student_name ? "text-success" : "text-muted"}`}>{spot.student_name ? `Cursist: ${spot.student_name}` : "Nog geen cursist gekoppeld"}</p>
      </div>
      <form action={updatePracticalSpotAction} className="space-y-3">
        <input type="hidden" name="id" value={spot.id} />
        <SpotFields spot={spot} students={students} />
        <div className="flex flex-wrap gap-2">
          <SubmitButton className="btn-secondary" pendingText="Opslaan…">Opslaan</SubmitButton>
          <button type="submit" formAction={removePracticalSpotAction} formNoValidate className="btn-ghost text-bordeaux">Verwijderen</button>
        </div>
      </form>
    </li>
  );
}

const formatDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
