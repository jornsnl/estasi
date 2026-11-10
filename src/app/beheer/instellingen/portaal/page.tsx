import { saveSettings } from "@/app/actions/ws-admin";
import { uploadContactPhoto } from "@/app/actions/ws-fase2";
import Link from "next/link";
import { FileUpload } from "@/components/ws/FileUpload";
import { directUploads } from "@/lib/ws/files";
import { aiConfigured } from "@/lib/ws/ai";
import { Notice } from "@/components/Notice";
import { SettingsTabs } from "@/components/SettingsTabs";
import { SubmitButton } from "@/components/SubmitButton";
import { getSettings } from "@/lib/ws/settings";
import { mailConfigured } from "@/lib/ws/mail";

export const metadata = { title: "Instellingen" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSettings();
  const field = (name: string, label: string, value: string, type = "text") => (
    <div><label className="label" htmlFor={name}>{label}</label><input id={name} name={name} type={type} defaultValue={value} className="input" /></div>
  );
  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <p className="eyebrow">Beheer</p>
        <h1 className="mt-1 mb-6 text-4xl">Instellingen</h1>
        <SettingsTabs active="portaal" />
      </header>
      <Notice searchParams={searchParams} />
      {!mailConfigured() && (
        <p className="rounded-xl border border-gold/50 bg-white p-4 text-sm">
          E-mail staat nog niet aan (RESEND_API_KEY ontbreekt). Uitnodigingen toon ik je als link om zelf door te sturen; meldingen over vragen komen nog niet aan.
        </p>
      )}

      {!aiConfigured() && (
        <p className="rounded-xl border border-line bg-white p-4 text-sm text-muted">
          Samenvattingen van opdrachten en de stylingsamenvatting maak je met Claude via de koppeling (MCP). Je krijgt een mail zodra een bruidspaar een opdracht instuurt
          of afrondt, met de zin die je aan Claude kunt vragen.
        </p>
      )}

      <p id="rondleiding" className="rounded-xl border border-line bg-white p-4 text-sm text-muted">
        De rondleidingsvideo, het welkomstblok en de pop-up stel je in bij{" "}
        <Link href="/beheer/rondleiding" className="text-bordeaux underline">Systeem, Rondleiding</Link>.
      </p>

      <form action={uploadContactPhoto} className="card flex flex-wrap items-center gap-4 p-6">
        {s.contact_photo_file_id ? (
          // eslint-disable-next-line @next/next/no-img-element -- photo behind a login check
          <img src="/api/ws-foto" alt="Pasfoto" width={80} height={80} className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-cream text-xs text-muted">Geen foto</div>
        )}
        <div className="flex-1 space-y-2">
          <h2 className="text-xl">Pasfoto in de contactkaart</h2>
          <FileUpload name="photo" coupleId={null} kind="image" direct={directUploads()} label="Pasfoto uploaden" />
          {s.contact_photo_file_id && <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" name="remove" /> Foto verwijderen</label>}
        </div>
        <SubmitButton className="btn-secondary" pendingText="Uploaden…">Opslaan</SubmitButton>
      </form>

      <form action={saveSettings} className="card space-y-5 p-6">
        <h2 className="text-xl">Contactblok</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("contactName", "Naam", s.contact_name)}
          {field("businessName", "Bedrijfsnaam", s.business_name)}
          {field("contactEmail", "E-mail", s.contact_email, "email")}
          {field("contactPhone", "Telefoon", s.contact_phone, "tel")}
          <div className="sm:col-span-2">{field("contactAddress", "Adres", s.contact_address)}</div>
          {field("kvk", "KVK-nummer", s.kvk)}
          {field("termsUrl", "Link naar algemene voorwaarden", s.terms_url, "url")}
        </div>
        <h2 className="pt-2 text-xl">Teksten</h2>
        <input type="hidden" name="defaultWelcome" value={s.default_welcome} />
        <div>
          <label className="label" htmlFor="meetingGuides">Richtlijn per meeting (Meeting 1, 2, 3, ...)</label>
          <textarea id="meetingGuides" name="meetingGuides" rows={8} defaultValue={(s.meeting_guides ?? []).join("\n\n")} className="input" />
          <p className="hint">Eén alinea per meeting, gescheiden door een lege regel. Je kunt het per bruidspaar nog aanpassen.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="detailGuide">Detailbespreking</label><textarea id="detailGuide" name="detailGuide" rows={3} defaultValue={s.detail_guide} className="input" /></div>
          <div><label className="label" htmlFor="evaluationGuide">Evaluatie</label><textarea id="evaluationGuide" name="evaluationGuide" rows={3} defaultValue={s.evaluation_guide} className="input" /></div>
        </div>
        <SubmitButton className="btn-primary" pendingText="Opslaan…">Instellingen opslaan</SubmitButton>
      </form>

      <p className="rounded-xl border border-line bg-white p-4 text-sm text-muted">
        De leverancierscategorieën staan bij{" "}
        <Link href="/beheer/bruidsparen/standaardlijsten#categorieen" className="text-bordeaux underline">Bruidsparen, Standaardlijsten</Link>.
      </p>
    </div>
  );
}
