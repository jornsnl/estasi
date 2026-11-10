import { saveSignupPageAction } from "@/app/actions/content";
import { Notice } from "@/components/Notice";
import { PhotoInput } from "@/components/PhotoInput";
import { SettingsTabs } from "@/components/SettingsTabs";
import { SubmitButton } from "@/components/SubmitButton";
import { requireOwner } from "@/lib/auth/session";
import { getSignupPage } from "@/lib/signup-page";
import { IMAGE_ACCEPT_ATTR } from "@/lib/uploads";

export const metadata = { title: "Inschrijfpagina" };

/** Beheer, Instellingen, Inschrijfpagina: the pictures and the review on academy.estasiweddings.nl/inschrijven. */
export default async function SignupPageSettings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const page = await getSignupPage();
  return (
    <div className="max-w-2xl">
      <p className="eyebrow">Beheer</p>
      <h1 className="mt-1 mb-6 text-4xl">Instellingen</h1>
      <SettingsTabs active="inschrijfpagina" />
      <Notice searchParams={searchParams} />
      <p className="mb-6 text-sm text-muted">
        Wat hier staat, verschijnt op de openbare inschrijfpagina van de Academy.{" "}
        <a href="/inschrijven" target="_blank" rel="noreferrer" className="text-bordeaux underline">Bekijk de pagina</a>
      </p>
      <form action={saveSignupPageAction} className="space-y-6">
        <section className="card space-y-5 p-6">
          <h2 className="text-2xl">Logo en foto</h2>
          <ImageField
            name="logo"
            label="Logo"
            fileId={page.logo_file_id}
            accept={`${IMAGE_ACCEPT_ATTR},image/svg+xml,.svg`}
            hint="SVG (aanbevolen), png of jpg. Staat in de header en groot in een licht gekantelde cirkel bovenaan de pagina. Zonder logo hier staat het logo van Future Weddings Academy uit Instellingen, Logo&apos;s."
            contain
          />
          <ImageField name="trainerPhoto" label="Foto van jou bij 'Je opleider'" fileId={page.trainer_photo_file_id} hint="Wordt rond afgesneden. Een portretfoto met je gezicht in het midden werkt het best." round />
        </section>

        <section className="card space-y-5 p-6">
          <h2 className="text-2xl">Review</h2>
          <p className="text-sm text-muted">Staat onder &quot;Zo werkt het&quot;, met twee foto&apos;s ernaast. Zonder tekst staat er geen review op de pagina.</p>
          <div>
            <label htmlFor="reviewText" className="label">Tekst van de review</label>
            <textarea id="reviewText" name="reviewText" rows={8} maxLength={3000} defaultValue={page.review_text} className="input" />
          </div>
          <div>
            <label htmlFor="reviewName" className="label">Naam onder de review (optioneel)</label>
            <input id="reviewName" name="reviewName" maxLength={120} defaultValue={page.review_name} className="input" placeholder="Bijvoorbeeld: Anna, cursist pakket B" />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <ImageField name="reviewPhoto1" label="Foto 1" fileId={page.review_photo1_file_id} />
            <ImageField name="reviewPhoto2" label="Foto 2" fileId={page.review_photo2_file_id} />
          </div>
        </section>

        <SubmitButton pendingText="Opslaan…">Inschrijfpagina opslaan</SubmitButton>
      </form>
    </div>
  );
}

function ImageField(props: { name: string; label: string; fileId: string | null; hint?: string; accept?: string; round?: boolean; contain?: boolean }) {
  return (
    <div className="space-y-1.5">
      <p className="label">{props.label}</p>
      {props.fileId && (
        // eslint-disable-next-line @next/next/no-img-element -- picture of the public sign up page
        <img
          src={`/api/inschrijven/foto/${props.fileId}`}
          alt=""
          className={`border border-line bg-white ${props.round ? "h-28 w-28 rounded-full object-cover" : props.contain ? "h-28 w-28 rounded-xl object-contain p-2" : "h-40 w-full max-w-xs rounded-xl object-cover"}`}
        />
      )}
      {/* The logo (SVG or png with transparency) goes as it is; photos are made smaller first. */}
      <PhotoInput name={props.name} label={`${props.label} kiezen`} accept={props.accept ?? IMAGE_ACCEPT_ATTR} shrink={!props.contain} saveLabel="Opslaan" />
      {props.fileId && (
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" name={`remove-${props.name}`} /> Weghalen
        </label>
      )}
      {props.hint && <p className="hint">{props.hint}</p>}
    </div>
  );
}
