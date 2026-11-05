import { archiveCategory, saveCategory, saveSettings } from "@/app/actions/ws-admin";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { query } from "@/lib/ws/db";
import { getSettings } from "@/lib/ws/settings";
import { mailConfigured } from "@/lib/ws/mail";
import type { SupplierCategory } from "@/lib/ws/types";

export const metadata = { title: "Instellingen" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [s, categories] = await Promise.all([getSettings(), query<SupplierCategory>("select * from supplier_categories order by archived, position, name")]);
  const field = (name: string, label: string, value: string, type = "text") => (
    <div><label className="label" htmlFor={name}>{label}</label><input id={name} name={name} type={type} defaultValue={value} className="input" /></div>
  );
  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <p className="eyebrow">Beheer</p>
        <h1 className="mt-1 text-3xl">Instellingen</h1>
      </header>
      <Notice searchParams={searchParams} />
      {!mailConfigured() && (
        <p className="rounded-xl border border-gold/50 bg-white p-4 text-sm">
          E-mail staat nog niet aan (SMTP ontbreekt). Uitnodigingen toon ik je als link om zelf door te sturen; meldingen over vragen komen nog niet aan.
        </p>
      )}

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
        <div>
          <label className="label" htmlFor="defaultWelcome">Standaard welkomsttekst voor nieuwe bruidsparen</label>
          <textarea id="defaultWelcome" name="defaultWelcome" rows={3} defaultValue={s.default_welcome} className="input" />
        </div>
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

      <section id="categorieen" className="card scroll-mt-6 p-6">
        <h2 className="text-xl">Leverancierscategorieën</h2>
        <p className="mt-1 text-sm text-muted">Deze categorieën ziet elk bruidspaar bij &quot;Jullie leveranciers&quot;, ook zolang er nog niets is ingevuld.</p>
        <ul className="mt-4 space-y-2">
          {categories.map((c) => (
            <li key={c.id} className={`flex flex-wrap items-center gap-2 ${c.archived ? "opacity-50" : ""}`}>
              <form action={saveCategory} className="flex flex-1 gap-2">
                <input type="hidden" name="categoryId" value={c.id} />
                <input name="name" defaultValue={c.name} required aria-label="Naam categorie" className="input py-1.5" />
                <SubmitButton className="btn-secondary py-1.5">Opslaan</SubmitButton>
              </form>
              <form action={archiveCategory}>
                <input type="hidden" name="categoryId" value={c.id} />
                <input type="hidden" name="archived" value={c.archived ? "0" : "1"} />
                <SubmitButton className="btn-ghost py-1.5 text-xs">{c.archived ? "Weer tonen" : "Verbergen"}</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
        <form action={saveCategory} className="mt-4 flex gap-2">
          <input name="name" required placeholder="Nieuwe categorie" aria-label="Nieuwe categorie" className="input py-1.5" />
          <SubmitButton className="btn-primary py-1.5">Toevoegen</SubmitButton>
        </form>
      </section>
    </div>
  );
}
