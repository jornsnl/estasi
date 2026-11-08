import Link from "next/link";
import { saveSettings } from "@/app/actions/content";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { getStore } from "@/lib/data";
import { supabaseEnabled } from "@/lib/supabase/config";
import { LIMITS } from "@/lib/domain/input";
import { authClient } from "@/lib/supabase/server";

export const metadata = { title: "Instellingen" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getStore().getSettings();
  let mfaLinked: boolean | null = null;
  if (supabaseEnabled()) {
    const { data } = await (await authClient()).auth.mfa.listFactors();
    mfaLinked = Boolean(data?.totp.some((f) => f.status === "verified"));
  }
  return (
    <div className="max-w-2xl">
      <p className="eyebrow">Beheer</p>
      <h1 className="mt-1 mb-8 text-4xl">Instellingen</h1>
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
          <div>
            <label htmlFor="welcomeVideoUrl" className="label">Welkomstvideo (link)</label>
            <input id="welcomeVideoUrl" name="welcomeVideoUrl" inputMode="url" autoComplete="off" defaultValue={s.welcomeVideoUrl} maxLength={LIMITS.url} className="input" />
          </div>
          <div>
            <label htmlFor="welcomeText" className="label">Welkomsttekst</label>
            <textarea id="welcomeText" name="welcomeText" rows={3} defaultValue={s.welcomeText} maxLength={LIMITS.welcomeText} className="input" />
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
    </div>
  );
}
