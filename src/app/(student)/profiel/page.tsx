import { saveProfile } from "@/app/actions/profile";
import { Markdown } from "@/components/Markdown";
import { PrivacyNotice } from "@/components/academy/PrivacyNotice";
import { NotificationSettings } from "@/components/community/NotificationSettings";
import { Notice } from "@/components/Notice";
import { PhotoInput } from "@/components/PhotoInput";
import { SubmitButton } from "@/components/SubmitButton";
import { requireStudent } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { LIMITS } from "@/lib/domain/input";

export const metadata = { title: "Mijn profiel" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireStudent();
  const [profile, settings] = await Promise.all([getStore().getProfile(user.id), getStore().getSettings()]);

  const text = (name: string, label: string, value: string | undefined, maxLength: number, type = "text", autoComplete?: string) => (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      <input
        id={name}
        name={name}
        // A website without https:// is completed on save instead of blocking the form.
        type={type === "url" ? "text" : type}
        inputMode={type === "url" ? "url" : undefined}
        defaultValue={value ?? ""}
        autoComplete={autoComplete}
        maxLength={maxLength}
        className="input"
      />
    </div>
  );

  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Mijn profiel</p>
      <h1 className="mt-1 mb-2 text-4xl">Over jou</h1>
      <p className="mb-8 text-muted">
        Deze gegevens zijn alleen zichtbaar voor jou en je opleider. In de community zien andere cursisten alleen je naam en je profielfoto bij je berichten.
      </p>
      <Notice searchParams={searchParams} />

      <form action={saveProfile} className="space-y-8">
        <section className="card space-y-4 p-6">
          <h2 className="text-2xl">Gegevens</h2>
          {/* Feedback Sabine (25): a circle, so it is clear a profile photo goes there; after saving the photo is in it. */}
          <div className="text-sm">
            <p className="label">Profielfoto</p>
            <PhotoInput
              name="photo"
              label="Profielfoto kiezen"
              saveLabel="Profielfoto opslaan"
              avatar={{ src: profile?.photoFileId ? `/api/bestanden/${profile.photoFileId}` : null, initial: user.name.charAt(0) || "?" }}
            />
            {profile?.photoFileId && (
              <label className="mt-1 flex items-center gap-1.5 text-muted">
                <input type="checkbox" name="removePhoto" /> foto verwijderen
              </label>
            )}
            <p className="mt-1 text-xs text-muted">Staat bij je berichten in de community.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("name", "Naam", user.name, LIMITS.name, "text", "name")}
            <div>
              <span className="label">E-mailadres</span>
              <p className="input bg-cream text-muted">{user.email}</p>
            </div>
            {text("phone", "Telefoon", profile?.phone, LIMITS.phone, "tel", "tel")}
            {text("city", "Woonplaats", profile?.city, LIMITS.city, "text", "address-level2")}
            {text("companyName", "Bedrijfsnaam (optioneel)", profile?.companyName, LIMITS.companyName, "text", "organization")}
          </div>
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="text-2xl">Socials</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("instagram", "Instagram", profile?.instagram, LIMITS.social)}
            {text("website", "Website", profile?.website, LIMITS.social, "url")}
          </div>
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="text-2xl">Introductie en doelen</h2>
          <div>
            <label htmlFor="intro" className="label">Korte introductie</label>
            <textarea id="intro" name="intro" rows={4} defaultValue={profile?.intro ?? ""} maxLength={LIMITS.intro} className="input" />
          </div>
          <div>
            <label htmlFor="goals" className="label">Ondernemersdoelen</label>
            <textarea id="goals" name="goals" rows={4} defaultValue={profile?.goals ?? ""} maxLength={LIMITS.intro} className="input" />
          </div>
        </section>

        <SubmitButton pendingText="Opslaan…">Profiel opslaan</SubmitButton>
      </form>

      <div className="mt-8">
        <NotificationSettings userId={user.id} />
      </div>

      <div className="mt-8">
        {settings.privacyText.trim() ? (
          <section id="privacy" className="card space-y-3 p-6 text-sm">
            <h2 className="text-2xl">Privacy</h2>
            <Markdown>{settings.privacyText}</Markdown>
          </section>
        ) : (
          <PrivacyNotice contactEmail={settings.contactEmail} />
        )}
      </div>
    </div>
  );
}
