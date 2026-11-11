import { saveBrandLogosAction } from "@/app/actions/content";
import { Notice } from "@/components/Notice";
import { LogoCropper } from "@/components/LogoCropper";
import { SettingsTabs } from "@/components/SettingsTabs";
import { SubmitButton } from "@/components/SubmitButton";
import { requireOwner } from "@/lib/auth/session";
import { cropKey } from "@/lib/brand-logo-urls";
import { getBrandLogos, getLogoCrops, LOGO_LABELS, type LogoKind } from "@/lib/brand-logos";
import { BRAND_LOGO_ACCEPT_ATTR } from "@/lib/uploads";

export const metadata = { title: "Logo's" };

const WHERE: Record<LogoKind, string> = {
  academy: "Voor cursisten: bovenin elke mail van de Academy en als app-icoon van de Academy op hun beginscherm.",
  estasi: "Voor bruidsparen: bovenin elke mail van Estasi Weddings en Your Wedding Space en als app-icoon van hun portaal.",
  app: "Het icoon van het beheer op jouw eigen beginscherm. Zonder eigen logo staat hier het logo van Estasi Weddings.",
};

/** Beheer, Instellingen, Logo's (feedback Sabine): the logos in the mails and as app icon, instead of the bordeaux E. */
export default async function LogoSettings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const [logos, crops] = await Promise.all([getBrandLogos(), getLogoCrops()]);
  const kinds: LogoKind[] = ["academy", "estasi", "app"];
  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Beheer</p>
      <h1 className="mt-1 mb-6 text-4xl">Instellingen</h1>
      <SettingsTabs active="logos" />
      <Notice searchParams={searchParams} />
      <p className="mb-6 text-sm text-muted">
        Upload je logo&apos;s als SVG, png of jpg (SVG of een png van minstens 512 bij 512 pixels geeft het scherpste resultaat). Voor de mails en het app-icoon maak ik er
        zelf een png van in de juiste maat. Het app-icoon is vierkant, met je logo op een witte achtergrond; de uitsnede ervan bepaal je zelf.
      </p>
      <form action={saveBrandLogosAction} className="space-y-6">
        {kinds.map((kind) => {
          const fileId = logos[kind];
          const version = fileId ? `${fileId.slice(0, 8)}-${cropKey(crops[kind])}` : "";
          return (
            <section key={kind} className="card grid gap-5 p-6 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <h2 className="text-2xl">{LOGO_LABELS[kind]}</h2>
                <p className="text-sm text-muted">{WHERE[kind]}</p>
                <LogoCropper
                  kind={kind}
                  label={`${LOGO_LABELS[kind]} kiezen`}
                  accept={BRAND_LOGO_ACCEPT_ATTR}
                  current={fileId ? `/api/logo/${kind}/original?v=${fileId.slice(0, 8)}` : null}
                  initial={crops[kind]}
                />
                {fileId && (
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <input type="checkbox" name={`remove-${kind}`} /> Weghalen
                  </label>
                )}
              </div>
              <div className="flex gap-4 sm:flex-col sm:items-center">
                {fileId ? (
                  <>
                    <figure className="text-center">
                      {/* eslint-disable-next-line @next/next/no-img-element -- the uploaded logo, may be an SVG */}
                      <img src={`/api/logo/${kind}/original?v=${fileId.slice(0, 8)}`} alt={LOGO_LABELS[kind]} className="h-20 w-40 rounded-lg border border-line bg-white object-contain p-2" />
                      <figcaption className="mt-1 text-xs text-muted">Logo</figcaption>
                    </figure>
                    <figure className="text-center">
                      {/* eslint-disable-next-line @next/next/no-img-element -- the app icon made from the logo */}
                      <img src={`/api/logo/${kind}/icon-180.png?v=${version}`} alt="" className="h-16 w-16 rounded-2xl border border-line shadow-sm" />
                      <figcaption className="mt-1 text-xs text-muted">App-icoon</figcaption>
                    </figure>
                  </>
                ) : (
                  <p className="flex h-20 w-40 items-center justify-center rounded-lg border border-dashed border-line text-center text-xs text-muted">Nog geen logo</p>
                )}
              </div>
            </section>
          );
        })}
        <SubmitButton pendingText="Uploaden…">Logo&apos;s opslaan</SubmitButton>
      </form>
    </div>
  );
}
