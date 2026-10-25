import { saveProfile } from "@/app/actions/profile";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { requireStudent } from "@/lib/auth/session";
import { getStore } from "@/lib/data";

export const metadata = { title: "Mijn profiel" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireStudent();
  const profile = await getStore().getProfile(user.id);

  const text = (name: string, label: string, value: string | undefined, type = "text", autoComplete?: string) => (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      <input id={name} name={name} type={type} defaultValue={value ?? ""} autoComplete={autoComplete} className="input" />
    </div>
  );

  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Mijn profiel</p>
      <h1 className="mt-1 mb-2 text-4xl">Over jou</h1>
      <p className="mb-8 text-muted">
        Deze gegevens zijn nu alleen zichtbaar voor jou en je opleider. Wat later zichtbaar wordt in de community, kies je straks zelf.
      </p>
      <Notice searchParams={searchParams} />

      <form action={saveProfile} className="space-y-8">
        <section className="card space-y-4 p-6">
          <h2 className="text-2xl">Gegevens</h2>
          <div className="flex items-center gap-4">
            {profile?.photoFileId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/bestanden/${profile.photoFileId}`} alt="" className="h-20 w-20 rounded-full border border-line object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gold-soft font-serif text-2xl text-gold-ink">
                {user.name.charAt(0)}
              </div>
            )}
            <div className="text-sm">
              <label htmlFor="photo" className="label">Profielfoto</label>
              <input id="photo" name="photo" type="file" accept="image/*" className="text-sm" />
              {profile?.photoFileId && (
                <label className="mt-1 flex items-center gap-1.5 text-muted">
                  <input type="checkbox" name="removePhoto" /> foto verwijderen
                </label>
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("name", "Naam", user.name, "text", "name")}
            <div>
              <span className="label">E-mailadres</span>
              <p className="input bg-cream text-muted">{user.email}</p>
            </div>
            {text("phone", "Telefoon", profile?.phone, "tel", "tel")}
            {text("city", "Woonplaats", profile?.city, "text", "address-level2")}
            {text("companyName", "Bedrijfsnaam (optioneel)", profile?.companyName, "text", "organization")}
          </div>
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="text-2xl">Socials</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("instagram", "Instagram", profile?.instagram)}
            {text("website", "Website", profile?.website, "url")}
          </div>
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="text-2xl">Introductie en doelen</h2>
          <div>
            <label htmlFor="intro" className="label">Korte introductie</label>
            <textarea id="intro" name="intro" rows={4} defaultValue={profile?.intro ?? ""} className="input" />
          </div>
          <div>
            <label htmlFor="goals" className="label">Ondernemersdoelen</label>
            <textarea id="goals" name="goals" rows={4} defaultValue={profile?.goals ?? ""} className="input" />
          </div>
        </section>

        <SubmitButton pendingText="Opslaan…">Profiel opslaan</SubmitButton>
      </form>
    </div>
  );
}
