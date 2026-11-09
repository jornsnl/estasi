import Link from "next/link";
import { saveSettings } from "@/app/actions/content";
import { sendTestMail } from "@/app/actions/mail-test";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { Notice } from "@/components/Notice";
import { SettingsTabs } from "@/components/SettingsTabs";
import { SubmitButton } from "@/components/SubmitButton";
import { getStore } from "@/lib/data";
import { supabaseEnabled } from "@/lib/supabase/config";
import { LIMITS } from "@/lib/domain/input";
import { authClient } from "@/lib/supabase/server";
import { mailFrom, mailTransport } from "@/lib/ws/mail";

export const metadata = { title: "Instellingen" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getStore().getSettings();
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
              <option value="academy">Wedding Plan Academy</option>
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
