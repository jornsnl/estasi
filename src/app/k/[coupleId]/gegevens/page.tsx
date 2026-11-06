import { cookies } from "next/headers";
import { resendInvite, setCoupleStatus, shareCouple, updateCouple, uploadCover } from "@/app/actions/ws-admin";
import { CoupleFields } from "@/components/ws/CoupleFields";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { requireCoupleAdmin } from "@/lib/ws/access";
import { coupleMembers } from "@/lib/ws/couples";
import { FileUpload } from "@/components/ws/FileUpload";
import { directUploads } from "@/lib/ws/files";
import { formatDateTime } from "@/lib/ws/format";
import { mailConfigured } from "@/lib/ws/mail";

export const metadata = { title: "Gegevens & delen" };

export default async function CoupleSettings({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple } = await requireCoupleAdmin(coupleId);
  const accounts = await coupleMembers(couple.id);
  let links: { email: string; link: string }[] = [];
  try {
    links = JSON.parse((await cookies()).get("ws_links")?.value ?? "[]");
  } catch {
    links = [];
  }

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <p className="eyebrow">Beheer</p>
        <h1 className="mt-1 text-3xl">Gegevens & delen</h1>
      </header>
      <Notice searchParams={searchParams} />

      {links.length > 0 && (
        <section className="card border border-gold/50 p-5">
          <h2 className="text-lg">Stuur deze link zelf door</h2>
          <p className="mt-1 text-sm text-muted">De e-mail kon niet worden verstuurd{mailConfigured() ? "" : " (SMTP is niet ingesteld)"}. Deze link is persoonlijk en werkt één keer. Hij is hier maar kort zichtbaar.</p>
          {links.map((l) => (
            <div key={l.link} className="mt-3">
              <p className="text-sm font-medium">{l.email}</p>
              <p className="rounded-lg border border-line bg-cream p-3 font-mono text-xs break-all select-all">{l.link}</p>
            </div>
          ))}
        </section>
      )}

      <section className="card p-5">
        <h2 className="text-xl">Toegang voor het bruidspaar</h2>
        {couple.status === "concept" && (
          <>
            <p className="mt-1 text-sm text-muted">
              Het portaal is nog een concept: alleen jij ziet het. Klik op de knop zodra de betaling binnen is. Iedere partner met een e-mailadres krijgt dan een persoonlijke uitnodiging.
            </p>
            <form action={shareCouple} className="mt-4">
              <input type="hidden" name="coupleId" value={couple.id} />
              <SubmitButton className="btn-primary" pendingText="Delen…" confirm="Het bruidspaar krijgt nu toegang en een uitnodiging per e-mail. Doorgaan?">
                Maak beschikbaar en deel met het bruidspaar
              </SubmitButton>
            </form>
          </>
        )}
        {couple.status !== "concept" && (
          <p className="mt-1 text-sm text-muted">
            {couple.status === "active" ? `Gedeeld sinds ${formatDateTime(couple.activated_at)}.` : "Gearchiveerd: het bruidspaar kan niet meer inloggen."}
          </p>
        )}
        {accounts.length > 0 && (
          <ul className="mt-4 divide-y divide-line text-sm">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div>
                  <p>{a.name} · {a.email}</p>
                  <p className="text-xs text-muted">{a.activated ? `Actief${a.lastActiveAt ? `, laatst actief ${formatDateTime(a.lastActiveAt)}` : ""}` : "Uitgenodigd, nog geen wachtwoord gekozen"}</p>
                </div>
                {couple.status === "active" && (
                  <form action={resendInvite}>
                    <input type="hidden" name="coupleId" value={couple.id} />
                    <input type="hidden" name="accountId" value={a.id} />
                    <SubmitButton className="btn-secondary py-1.5 text-xs">{a.activated ? "Wachtwoordlink sturen" : "Uitnodiging opnieuw sturen"}</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {couple.status === "active" && (
          <form action={shareCouple} className="mt-3">
            <input type="hidden" name="coupleId" value={couple.id} />
            <SubmitButton className="btn-ghost px-0 text-xs">Nieuwe e-mailadressen hierboven uitnodigen</SubmitButton>
          </form>
        )}
      </section>

      <form action={updateCouple} className="card space-y-6 p-6">
        <input type="hidden" name="coupleId" value={couple.id} />
        <CoupleFields couple={couple} />
        <div>
          <label className="label" htmlFor="welcomeText">Welkomsttekst op de hoofdpagina</label>
          <textarea id="welcomeText" name="welcomeText" rows={4} defaultValue={couple.welcome_text} className="input" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="suppliersEnabled" defaultChecked={couple.suppliers_enabled} className="accent-[#6B1E2E]" /> Onderdeel &quot;Jullie leveranciers&quot; tonen
        </label>
        <SubmitButton className="btn-primary" pendingText="Opslaan…">Gegevens opslaan</SubmitButton>
      </form>

      <form action={uploadCover} className="card space-y-3 p-6">
        <input type="hidden" name="coupleId" value={couple.id} />
        <h2 className="text-xl">Coverfoto</h2>
        <p className="text-sm text-muted">Bovenaan de hoofdpagina, achter de namen. Liggend formaat werkt het best (jpg, png of webp, maximaal 10 MB).</p>
        <FileUpload name="cover" coupleId={couple.id} kind="image" direct={directUploads()} label="Coverfoto uploaden" />
        {couple.cover_file_id && (
          <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" name="removeCover" /> Huidige coverfoto verwijderen</label>
        )}
        <SubmitButton className="btn-secondary" pendingText="Uploaden…">Coverfoto opslaan</SubmitButton>
      </form>

      <section className="card p-5">
        <h2 className="text-xl">Status</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {couple.status !== "archived" && (
            <form action={setCoupleStatus}>
              <input type="hidden" name="coupleId" value={couple.id} />
              <input type="hidden" name="status" value="archived" />
              <SubmitButton className="btn-secondary" confirm="Archiveren? Het bruidspaar kan daarna niet meer inloggen.">Archiveren</SubmitButton>
            </form>
          )}
          {couple.status === "active" && (
            <form action={setCoupleStatus}>
              <input type="hidden" name="coupleId" value={couple.id} />
              <input type="hidden" name="status" value="concept" />
              <SubmitButton className="btn-ghost">Weer verbergen voor het bruidspaar</SubmitButton>
            </form>
          )}
          {couple.status === "archived" && (
            <form action={setCoupleStatus}>
              <input type="hidden" name="coupleId" value={couple.id} />
              <input type="hidden" name="status" value="active" />
              <SubmitButton className="btn-secondary">Weer actief maken</SubmitButton>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
