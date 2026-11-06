import Link from "next/link";
import { saveRsvpForm, saveRsvpQuestion } from "@/app/actions/ws-fase2";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { requirePlanning } from "@/lib/ws/access";
import { query } from "@/lib/ws/db";
import { appUrl } from "@/lib/ws/mail";
import type { RsvpForm, RsvpQuestion } from "@/lib/ws/rsvp";

export const metadata = { title: "RSVP-formulieren" };

function FormFields({ coupleId, form }: { coupleId: string; form?: RsvpForm }) {
  const k = form?.id ?? "nieuw";
  return (
    <form action={saveRsvpForm} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="coupleId" value={coupleId} />
      {form && <input type="hidden" name="formId" value={form.id} />}
      <div><label className="label" htmlFor={`n-${k}`}>Naam (zien gasten als titel)</label><input id={`n-${k}`} name="name" required defaultValue={form?.name ?? ""} placeholder="Daggasten" className="input" /></div>
      <div><label className="label" htmlFor={`d-${k}`}>Dresscode (leeg = niet vragen)</label><input id={`d-${k}`} name="dresscode" defaultValue={form?.dresscode ?? ""} placeholder="Black Tie & Elegant Dress" className="input" /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor={`i-${k}`}>Welkomsttekst boven het formulier</label><textarea id={`i-${k}`} name="intro" rows={2} defaultValue={form?.intro ?? ""} className="input" /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="askPartOfDay" defaultChecked={form?.ask_part_of_day ?? false} className="accent-[#6B1E2E]" /> Vraag &quot;deel van de dag&quot; (daggasten)</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="askDiet" defaultChecked={form?.ask_diet ?? false} className="accent-[#6B1E2E]" /> Vraag naar dieetwensen en allergieën</label>
      <div className="sm:col-span-2"><label className="label" htmlFor={`c-${k}`}>Bevestigingsmail bij &quot;ja&quot; (leeg = standaardtekst)</label><textarea id={`c-${k}`} name="confirmationText" rows={3} defaultValue={form?.confirmation_text ?? ""} className="input" /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor={`x-${k}`}>Mail bij &quot;helaas niet&quot; (leeg = standaardtekst)</label><textarea id={`x-${k}`} name="declineText" rows={2} defaultValue={form?.decline_text ?? ""} className="input" /></div>
      <div className="flex flex-wrap items-end gap-4 sm:col-span-2">
        <label className="text-sm">Kleur QR-code<input type="color" name="qrColor" defaultValue={form?.qr_color ?? "#2c2c2c"} className="ml-2 h-8 w-12 align-middle" /></label>
        <label className="text-sm">Achtergrond<input type="color" name="qrBackground" defaultValue={form?.qr_background ?? "#ffffff"} className="ml-2 h-8 w-12 align-middle" /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="open" defaultChecked={form?.open ?? true} className="accent-[#6B1E2E]" /> Open voor aanmeldingen</label>
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton className="btn-primary" pendingText="Opslaan…">{form ? "Opslaan" : "Formulier aanmaken"}</SubmitButton>
        {form && <SubmitButton name="intent" value="delete" className="btn-ghost text-bordeaux" confirm={`Formulier "${form.name}" verwijderen? De link werkt daarna niet meer.`}>Verwijderen</SubmitButton>}
      </div>
    </form>
  );
}

export default async function RsvpForms({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple, isAdmin } = await requirePlanning(coupleId);
  const [forms, questions] = await Promise.all([
    query<RsvpForm>("select * from rsvp_forms where couple_id = $1 order by position", [couple.id]),
    query<RsvpQuestion>("select q.* from rsvp_questions q join rsvp_forms f on f.id = q.form_id where f.couple_id = $1 order by q.position", [couple.id]),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <Link href={`/k/${couple.id}/gasten`} className="text-sm text-muted hover:text-bordeaux">← Gastenlijst</Link>
        <h1 className="mt-2 text-3xl">RSVP-formulieren & QR-codes</h1>
        <p className="mt-1 text-sm text-muted">Per groep (bijvoorbeeld daggasten en avondgasten) een eigen link en QR-code voor op de trouwkaart.</p>
      </header>
      <Notice searchParams={searchParams} />

      {forms.length === 0 && <p className="card p-5 text-sm text-muted">{isAdmin ? "Nog geen formulieren. Maak er hieronder een aan." : "Sabine zet de RSVP-formulieren voor jullie klaar."}</p>}

      {forms.map((form) => {
        const link = `${appUrl()}/rsvp/${form.slug}`;
        const formQuestions = questions.filter((q) => q.form_id === form.id);
        return (
          <section key={form.id} id={`f-${form.id}`} className="card scroll-mt-6 space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl">{form.name}{!form.open && <span className="ml-2 text-sm text-muted">(gesloten)</span>}</h2>
                <p className="mt-2 text-sm">Link voor gasten:</p>
                <p className="rounded-lg border border-line bg-cream px-3 py-2 font-mono text-xs break-all select-all">{link}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  <a href={link} target="_blank" rel="noreferrer" className="btn-secondary py-1.5">Formulier bekijken</a>
                  <a href={`/api/ws-qr/${form.id}?format=png&download=1`} className="btn-secondary py-1.5">QR-code (png)</a>
                  <a href={`/api/ws-qr/${form.id}?format=svg&download=1`} className="btn-secondary py-1.5">QR-code (svg, voor drukwerk)</a>
                </div>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- generated QR code */}
              <img src={`/api/ws-qr/${form.id}?format=svg&v=${encodeURIComponent(form.qr_color + form.qr_background)}`} alt={`QR-code voor ${form.name}`} width={140} height={140} className="rounded-lg border border-line" />
            </div>
            {isAdmin && (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-bordeaux">Formulier aanpassen</summary>
                <div className="mt-3 space-y-5">
                  <FormFields coupleId={couple.id} form={form} />
                  <div className="border-t border-line pt-4">
                    <h3 className="mb-2 font-sans text-sm font-medium">Extra vragen</h3>
                    <ul className="space-y-1.5 text-sm">
                      {formQuestions.map((q) => (
                        <li key={q.id} className="flex items-center justify-between gap-2 rounded-lg bg-cream px-3 py-1.5">
                          <span>{q.label} <span className="text-xs text-muted">({q.kind === "yesno" ? "ja/nee" : "tekst"})</span></span>
                          <form action={saveRsvpQuestion}>
                            <input type="hidden" name="coupleId" value={couple.id} />
                            <input type="hidden" name="formId" value={form.id} />
                            <input type="hidden" name="questionId" value={q.id} />
                            <SubmitButton className="text-xs text-muted hover:text-bordeaux" confirm="Deze vraag verwijderen?">Verwijderen</SubmitButton>
                          </form>
                        </li>
                      ))}
                    </ul>
                    <form action={saveRsvpQuestion} className="mt-2 flex flex-wrap gap-2">
                      <input type="hidden" name="coupleId" value={couple.id} />
                      <input type="hidden" name="formId" value={form.id} />
                      <input name="label" required placeholder="Bijvoorbeeld: Welk liedje mag de dj zeker niet vergeten?" aria-label="Nieuwe vraag" className="input flex-1 py-1.5" />
                      <select name="kind" aria-label="Soort antwoord" className="input w-auto py-1.5"><option value="text">Tekst</option><option value="yesno">Ja/nee</option></select>
                      <SubmitButton className="btn-secondary py-1.5">Toevoegen</SubmitButton>
                    </form>
                  </div>
                </div>
              </details>
            )}
          </section>
        );
      })}

      {isAdmin && (
        <section className="card p-5">
          <h2 className="mb-3 text-lg">Nieuw formulier</h2>
          <FormFields coupleId={couple.id} />
        </section>
      )}
    </div>
  );
}
