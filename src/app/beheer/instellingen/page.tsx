import Link from "next/link";
import { addPracticalSpotAction, removePracticalSpotAction, savePracticalSpotsOpenAction, saveSettings, updatePracticalSpotAction } from "@/app/actions/content";
import { sendTestMail } from "@/app/actions/mail-test";
import { AutoSubmitCheckbox } from "@/components/AutoSubmitCheckbox";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { Notice } from "@/components/Notice";
import { PhotoInput } from "@/components/PhotoInput";
import { SettingsTabs } from "@/components/SettingsTabs";
import { SubmitButton } from "@/components/SubmitButton";
import { getStore } from "@/lib/data";
import { supabaseEnabled } from "@/lib/supabase/config";
import { LIMITS } from "@/lib/domain/input";
import { authClient } from "@/lib/supabase/server";
import { mailFrom, mailTransport } from "@/lib/ws/mail";
import { listPracticalSpots, type PracticalSpot } from "@/lib/practical-spots";
import { PACKAGE_LABELS } from "@/lib/domain/labels";
import { todayIso } from "@/lib/ws/format";

export const metadata = { title: "Instellingen" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const store = getStore();
  const today = todayIso();
  const params = await searchParams;
  const editing = typeof params.bewerk === "string" ? params.bewerk : null;
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
            <PhotoInput name="headerImage" label="Headerfoto kiezen" saveLabel="Headerfoto opslaan" />
            {s.headerImageFileId && <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="removeHeaderImage" /> Foto weghalen</label>}
            <p className="hint">
              Optioneel. Zonder foto krijgt de header de kleuren van Estasi. Een brede, liggende foto werkt het mooist.{" "}
              {s.headerImageFileId && <Link href="/beheer/voorbeeld" className="text-bordeaux underline">Bekijk de hoofdpagina</Link>}
            </p>
          </div>
          <div>
            <label htmlFor="contactEmail" className="label">Contactadres voor cursisten</label>
            <input id="contactEmail" name="contactEmail" type="email" defaultValue={s.contactEmail} maxLength={LIMITS.contactEmail} className="input" />
            <p className="hint">Staat in het menu van elke cursist voor vragen en technische problemen.</p>
          </div>
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

      {/* Feedback Sabine: one box for the practical spots. The tick box stays, the note under it is gone,
          and directly below it the weddings: added in a box of their own and listed in a compact table. */}
      <section id="praktijkplekken" className="card mt-10 scroll-mt-6 space-y-5 p-6">
        <h2 className="text-2xl">Praktijkplekken</h2>
        <form action={savePracticalSpotsOpenAction} className="flex flex-wrap items-center gap-3">
          <AutoSubmitCheckbox name="practicalSpotsAvailable" defaultChecked={s.practicalSpotsAvailable}>
            Er zijn praktijkplekken beschikbaar (pakket B en upgrades toegestaan)
          </AutoSubmitCheckbox>
          <noscript>
            <button type="submit" className="btn-secondary px-3 py-1.5 text-sm">Opslaan</button>
          </noscript>
        </form>

        <form action={addPracticalSpotAction} className="space-y-3 rounded-xl border border-line bg-cream/50 p-4">
          <h3 className="font-sans text-base font-semibold">Praktijkplek per bruiloft toevoegen</h3>
          <SpotFields students={studentOptions} />
          <SubmitButton className="btn-secondary" pendingText="Toevoegen…">Toevoegen</SubmitButton>
        </form>

        {spots.length === 0 ? (
          <p className="rounded-lg bg-cream p-4 text-sm text-muted">Nog geen bruiloften toegevoegd.</p>
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">Bruidspaar</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Trouwdatum</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Locatie</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Gekoppelde cursist</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Notitie (intern)</th>
                  <th scope="col" className="py-2"><span className="sr-only">Acties</span></th>
                </tr>
              </thead>
              <tbody>
                {spots.map((spot) => (
                  <SpotRow key={spot.id} spot={spot} past={spot.wedding_date < today} editing={editing === spot.id} students={studentOptions} />
                ))}
              </tbody>
            </table>
          </div>
        )}
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
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_10rem_1fr]">
      <div>
        <label className="label" htmlFor={`names-${key}`}>Bruidspaar</label>
        <input id={`names-${key}`} name="coupleNames" required maxLength={200} defaultValue={spot?.couple_names} className="input" placeholder="Bijvoorbeeld: Lisa & Tom" />
      </div>
      <div>
        <label className="label" htmlFor={`date-${key}`}>Trouwdatum</label>
        <input id={`date-${key}`} name="weddingDate" type="date" required defaultValue={spot?.wedding_date} className="input" />
      </div>
      <div>
        <label className="label" htmlFor={`location-${key}`}>Locatie</label>
        <input id={`location-${key}`} name="location" maxLength={200} defaultValue={spot?.location} className="input" placeholder="Bijvoorbeeld: Kasteel de Haar" />
      </div>
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
      <div className="sm:col-span-1 lg:col-span-2">
        <label className="label" htmlFor={`note-${key}`}>Notitie (intern)</label>
        <input id={`note-${key}`} name="note" maxLength={300} defaultValue={spot?.note} className="input" placeholder="Bijvoorbeeld: tijden of contactpersoon" />
      </div>
    </div>
  );
}

/** One wedding as a row of the table; "Bewerken" opens the fields in a row below it (?bewerk=id, works without JavaScript). */
function SpotRow({ spot, past, editing, students }: { spot: PracticalSpot; past: boolean; editing: boolean; students: StudentOption[] }) {
  const cell = "py-2.5 pr-3 align-top";
  return (
    <>
      <tr className={`border-b border-line/70 ${past ? "text-muted" : ""}`}>
        <td className={`${cell} font-medium text-ink`}>
          {spot.couple_names}
          {past && <span className="ml-2 text-xs font-normal text-muted">geweest</span>}
        </td>
        <td className={`${cell} whitespace-nowrap`}>{formatDay(spot.wedding_date)}</td>
        <td className={cell}>{spot.location || <span className="text-muted">-</span>}</td>
        <td className={cell}>{spot.student_name ? <span className="text-success">{spot.student_name}</span> : <span className="text-muted">Nog geen cursist</span>}</td>
        <td className={`${cell} text-muted`}>{spot.note || "-"}</td>
        <td className="py-2.5 text-right align-top whitespace-nowrap">
          {editing ? (
            <Link href="/beheer/instellingen#praktijkplekken" className="text-bordeaux underline">Sluiten</Link>
          ) : (
            <Link href={`/beheer/instellingen?bewerk=${spot.id}#praktijkplek-${spot.id}`} className="text-bordeaux underline">Bewerken</Link>
          )}
        </td>
      </tr>
      {editing && (
        <tr id={`praktijkplek-${spot.id}`} className="scroll-mt-6 border-b border-line/70">
          <td colSpan={6} className="py-3">
            <form action={updatePracticalSpotAction} className="space-y-3 rounded-xl border border-line bg-cream/50 p-4">
              <input type="hidden" name="id" value={spot.id} />
              <SpotFields spot={spot} students={students} />
              <div className="flex flex-wrap gap-2">
                <SubmitButton className="btn-secondary" pendingText="Opslaan…">Opslaan</SubmitButton>
                <button type="submit" formAction={removePracticalSpotAction} formNoValidate className="btn-ghost text-bordeaux">Verwijderen</button>
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

const formatDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" });
