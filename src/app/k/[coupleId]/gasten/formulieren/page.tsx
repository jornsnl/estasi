import { createForm, deleteGroup, moveGroup, moveQuestion, saveForm, saveFormHeader, saveGroup, saveQuestion } from "@/app/actions/ws-rsvp";
import { MoveButtons } from "@/components/MoveButtons";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { AutoTextarea } from "@/components/ws/AutoTextarea";
import { FileUpload } from "@/components/ws/FileUpload";
import { GuestTabs } from "@/components/ws/GuestTabs";
import { HeaderPositioner } from "@/components/ws/HeaderPositioner";
import { requirePlanning } from "@/lib/ws/access";
import { query } from "@/lib/ws/db";
import { directUploads } from "@/lib/ws/files";
import { appUrl } from "@/lib/ws/mail";
import { groupsOf, QUESTION_KINDS, type RsvpForm, type RsvpQuestion } from "@/lib/ws/rsvp";

export const metadata = { title: "RSVP-formulieren" };

const PLACEHOLDERS = "In de teksten kun je [namen], [datum], [voornaam], [antwoorden] en [dresscode] gebruiken; die worden automatisch ingevuld.";

function QuestionForm({ coupleId, formId, q, others }: { coupleId: string; formId: string; q?: RsvpQuestion; others: RsvpQuestion[] }) {
  const k = q?.id ?? `new-${formId}`;
  return (
    <form action={saveQuestion} className="grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="coupleId" value={coupleId} />
      <input type="hidden" name="formId" value={formId} />
      {q && <input type="hidden" name="questionId" value={q.id} />}
      <div className="sm:col-span-2"><label className="label" htmlFor={`l-${k}`}>Vraag</label><input id={`l-${k}`} name="label" required defaultValue={q?.label} className="input py-1.5" /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor={`h-${k}`}>Toelichting (optioneel)</label><input id={`h-${k}`} name="help" defaultValue={q?.help} className="input py-1.5" /></div>
      <div>
        <label className="label" htmlFor={`k-${k}`}>Soort antwoord</label>
        <select id={`k-${k}`} name="kind" defaultValue={q?.kind ?? "short"} className="input py-1.5">
          {Object.entries(QUESTION_KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div><label className="label" htmlFor={`m-${k}`}>Maximaal aantal keuzes (bij meerdere keuzes)</label><input id={`m-${k}`} name="maxChoices" type="number" min={1} defaultValue={q?.max_choices ?? ""} className="input py-1.5" /></div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`o-${k}`}>Keuzes (bij één of meerdere keuzes), één per regel</label>
        <AutoTextarea id={`o-${k}`} name="options" defaultValue={(q?.options ?? []).join("\n")} className="input py-1.5" />
      </div>
      <div>
        <label className="label" htmlFor={`s-${k}`}>Alleen tonen als</label>
        <select id={`s-${k}`} name="showIfQuestionId" defaultValue={q?.show_if_question_id ?? ""} className="input py-1.5">
          <option value="">Altijd tonen</option>
          {others.filter((o) => o.id !== q?.id).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      <div><label className="label" htmlFor={`v-${k}`}>…als antwoord is (leeg = ingevuld)</label><input id={`v-${k}`} name="showIfValue" defaultValue={q?.show_if_value} placeholder="Bijvoorbeeld: Ja" className="input py-1.5" /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="required" defaultChecked={q?.required} className="accent-[#6B1E2E]" /> Verplicht</label>
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton className="btn-primary py-1.5" pendingText="Opslaan…">{q ? "Vraag opslaan" : "Vraag toevoegen"}</SubmitButton>
        {q && <SubmitButton name="intent" value="delete" className="btn-ghost py-1.5 text-bordeaux" confirm="Deze vraag verwijderen?">Verwijderen</SubmitButton>}
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
  const [groups, forms, questions, counts] = await Promise.all([
    groupsOf(couple.id),
    query<RsvpForm>("select * from rsvp_forms where couple_id = $1 order by position", [couple.id]),
    query<RsvpQuestion>("select q.* from rsvp_questions q join rsvp_forms f on f.id = q.form_id where f.couple_id = $1 order by q.position", [couple.id]),
    query<{ form_id: string; responses: number; coming: number }>(
      `select r.form_id, count(*)::int as responses, coalesce(sum(case when r.attending <> 'no' then r.party_count else 0 end), 0)::int as coming
         from rsvp_responses r where r.couple_id = $1 group by r.form_id`,
      [couple.id],
    ),
  ]);
  const direct = directUploads();
  const hidden = <input type="hidden" name="coupleId" value={couple.id} />;

  const formCard = (form: RsvpForm) => {
    const link = `${appUrl()}/rsvp/${form.slug}`;
    const formQuestions = questions.filter((q) => q.form_id === form.id);
    const count = counts.find((c) => c.form_id === form.id);
    return (
      <section key={form.id} id={`f-${form.id}`} className="card scroll-mt-6 space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-xl">{form.name}{!form.open && <span className="ml-2 text-sm text-muted">(gesloten)</span>}</h3>
            <p className="text-xs text-muted">{count ? `${count.responses} reacties, ${count.coming} personen komen` : "Nog geen reacties"}</p>
            <p className="mt-2 text-sm">Link voor gasten:</p>
            <p className="rounded-lg border border-line bg-cream px-3 py-2 font-mono text-xs break-all select-all">{link}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              {/* A relative link: always the same site, whatever APP_URL says. */}
              <a href={`/rsvp/${form.slug}`} target="_blank" rel="noopener" className="btn-secondary py-1.5">Formulier bekijken</a>
            </div>
            {/* The QR code holds only the fixed link above: it never expires. */}
            <form action={`/api/ws-qr/${form.id}`} method="get" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-cream px-3 py-2 text-sm">
              <input type="hidden" name="download" value="1" />
              <span className="font-medium">QR-code downloaden</span>
              <span className="flex flex-wrap gap-3">
                <label className="flex items-center gap-1.5"><input type="radio" name="bg" value="white" defaultChecked className="accent-[#6B1E2E]" /> {form.qr_background.toLowerCase() === "#ffffff" ? "Witte achtergrond" : "Met achtergrondkleur"}</label>
                <label className="flex items-center gap-1.5"><input type="radio" name="bg" value="transparent" className="accent-[#6B1E2E]" /> Transparant</label>
              </span>
              <select name="format" aria-label="Bestandsformaat" defaultValue="png" className="input w-auto py-1 text-sm">
                <option value="png">PNG</option>
                <option value="svg">SVG (voor drukwerk)</option>
              </select>
              <button type="submit" className="btn-secondary py-1">Downloaden</button>
            </form>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- generated QR code */}
          <img src={`/api/ws-qr/${form.id}?format=svg&v=${encodeURIComponent(form.qr_color + form.qr_background)}`} alt={`QR-code voor ${form.name}`} width={140} height={140} className="rounded-lg border border-line" />
        </div>

        {isAdmin && (
          <>
            <details>
              <summary className="cursor-pointer text-sm font-medium text-bordeaux">Formulier en mails aanpassen</summary>
              <form action={saveForm} className="mt-3 grid gap-3 sm:grid-cols-2">
                {hidden}
                <input type="hidden" name="formId" value={form.id} />
                <div><label className="label" htmlFor={`n-${form.id}`}>Naam (titel voor gasten)</label><input id={`n-${form.id}`} name="name" required defaultValue={form.name} className="input" /></div>
                <div>
                  <label className="label" htmlFor={`g-${form.id}`}>Gastengroep</label>
                  <select id={`g-${form.id}`} name="groupId" defaultValue={form.group_id ?? ""} className="input">
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor={`i-${form.id}`}>Welkomsttekst</label>
                  <AutoTextarea id={`i-${form.id}`} name="intro" defaultValue={form.intro} className="input" />
                </div>
                <fieldset className="space-y-1.5 sm:col-span-2">
                  <legend className="label">Standaardvragen die je aan of uit zet</legend>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="askPartOfDay" defaultChecked={form.ask_part_of_day} className="accent-[#6B1E2E]" /> Deel van de dag (met de vraag welke tijden)</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="askDiet" defaultChecked={form.ask_diet} className="accent-[#6B1E2E]" /> Dieetwensen en allergieën (per persoon)</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="askDresscode" defaultChecked={form.ask_dresscode} className="accent-[#6B1E2E]" /> Dresscode</label>
                  <p className="hint">Voornaam, achternaam, e-mail, telefoonnummer, relatie, aanwezigheid, aantal personen en de namen van de andere gasten staan er altijd in.</p>
                </fieldset>
                <div><label className="label" htmlFor={`d-${form.id}`}>Dresscode</label><input id={`d-${form.id}`} name="dresscode" defaultValue={form.dresscode} placeholder="Black Tie & Elegant Dress" className="input" /></div>
                <div><label className="label" htmlFor={`dn-${form.id}`}>Toelichting dresscode</label><AutoTextarea id={`dn-${form.id}`} name="dresscodeNote" defaultValue={form.dresscode_note} className="input" /></div>
                <p className="hint sm:col-span-2">{PLACEHOLDERS} Het overzicht van alle antwoorden komt altijd onderaan de mail.</p>
                <div className="sm:col-span-2"><label className="label" htmlFor={`cs-${form.id}`}>Onderwerp mail bij &quot;ja&quot; (aanwezig of deel van de dag)</label><input id={`cs-${form.id}`} name="confirmationSubject" defaultValue={form.confirmation_subject} className="input" /></div>
                <div className="sm:col-span-2"><label className="label" htmlFor={`c-${form.id}`}>Mail bij &quot;ja&quot;</label><AutoTextarea id={`c-${form.id}`} name="confirmationText" defaultValue={form.confirmation_text} className="input" /></div>
                <div className="sm:col-span-2"><label className="label" htmlFor={`xs-${form.id}`}>Onderwerp mail bij &quot;helaas niet&quot;</label><input id={`xs-${form.id}`} name="declineSubject" defaultValue={form.decline_subject} className="input" /></div>
                <div className="sm:col-span-2"><label className="label" htmlFor={`x-${form.id}`}>Mail bij &quot;helaas niet&quot;</label><AutoTextarea id={`x-${form.id}`} name="declineText" defaultValue={form.decline_text} className="input" /></div>
                <div className="flex flex-wrap items-end gap-4 sm:col-span-2">
                  <label className="text-sm">Kleur QR-code<input type="color" name="qrColor" defaultValue={form.qr_color} className="ml-2 h-8 w-12 align-middle" /></label>
                  <label className="text-sm">Achtergrond<input type="color" name="qrBackground" defaultValue={form.qr_background} className="ml-2 h-8 w-12 align-middle" /></label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="open" defaultChecked={form.open} className="accent-[#6B1E2E]" /> Open voor aanmeldingen</label>
                </div>
                <div className="flex gap-2 sm:col-span-2">
                  <SubmitButton className="btn-primary" pendingText="Opslaan…">Opslaan</SubmitButton>
                  <SubmitButton name="intent" value="delete" className="btn-ghost text-bordeaux" confirm={`Formulier "${form.name}" verwijderen? De link werkt daarna niet meer.`}>Verwijderen</SubmitButton>
                </div>
              </form>
            </details>

            <details>
              <summary className="cursor-pointer text-sm font-medium text-bordeaux">Headerfoto</summary>
              <form action={saveFormHeader} className="mt-3 space-y-3">
                {hidden}
                <input type="hidden" name="formId" value={form.id} />
                {form.header_file_id ? (
                  <HeaderPositioner src={`/api/ws-bestanden/${form.header_file_id}`} initial={form.header_position} />
                ) : (
                  <p className="text-sm text-muted">Geen eigen headerfoto: gasten zien de coverfoto van het bruidspaar, of anders een rustige crème header met het logo.</p>
                )}
                <FileUpload name="header" coupleId={couple.id} kind="image" direct={direct} label={form.header_file_id ? "Andere headerfoto" : "Headerfoto toevoegen"} />
                {form.header_file_id && <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" name="remove" /> Headerfoto verwijderen</label>}
                <SubmitButton className="btn-secondary" pendingText="Opslaan…">Headerfoto opslaan</SubmitButton>
              </form>
            </details>

            <div className="border-t border-line pt-4">
              <h4 className="mb-2 font-sans text-sm font-medium">Eigen vragen</h4>
              <ul className="space-y-1.5 text-sm">
                {formQuestions.map((q, i) => (
                  <li key={q.id} className="rounded-lg bg-cream px-3 py-1.5">
                    <div className="flex items-center gap-1">
                      <details className="flex-1">
                        <summary className="cursor-pointer">
                          {q.label}{q.required ? " *" : ""} <span className="text-xs text-muted">({QUESTION_KINDS[q.kind]}{q.show_if_question_id ? ", met voorwaarde" : ""})</span>
                        </summary>
                        <div className="mt-2 rounded-lg bg-white p-3"><QuestionForm coupleId={couple.id} formId={form.id} q={q} others={formQuestions} /></div>
                      </details>
                      <MoveButtons action={moveQuestion} id={q.id} first={i === 0} last={i === formQuestions.length - 1} extra={{ coupleId: couple.id, formId: form.id }} />
                    </div>
                  </li>
                ))}
              </ul>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-bordeaux">+ Vraag toevoegen</summary>
                <div className="mt-2 rounded-lg bg-cream p-3"><QuestionForm coupleId={couple.id} formId={form.id} others={formQuestions} /></div>
              </details>
            </div>
          </>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <p className="eyebrow">Onderdeel</p>
          <h1 className="mt-1 text-3xl">Gastenlijst & RSVP</h1>
        </div>
        <GuestTabs coupleId={couple.id} current="formulieren" isAdmin={isAdmin} />
        <p className="text-sm text-muted">Per gastengroep een of meer formulieren, elk met een eigen link en QR-code voor op de trouwkaart.</p>
      </header>
      <Notice searchParams={searchParams} />

      {groups.map((g) => {
        const groupForms = forms.filter((f) => f.group_id === g.id);
        return (
          <section key={g.id} className="space-y-3">
            <h2 className="section-title">{g.name}</h2>
            {groupForms.length === 0 && <p className="card p-4 text-sm text-muted">{isAdmin ? "Nog geen formulier voor deze groep." : "Sabine zet het formulier voor deze groep voor jullie klaar."}</p>}
            {groupForms.map(formCard)}
          </section>
        );
      })}
      {forms.filter((f) => !f.group_id || !groups.some((g) => g.id === f.group_id)).map(formCard)}

      {isAdmin && (
        <>
          <section className="card p-5">
            <h2 className="mb-3 text-lg">Nieuw formulier</h2>
            <form action={createForm} className="flex flex-wrap items-end gap-2">
              {hidden}
              <div>
                <label className="label" htmlFor="newFormGroup">Voor gastengroep</label>
                <select id="newFormGroup" name="groupId" required className="input">
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div className="min-w-48 flex-1"><label className="label" htmlFor="newFormName">Naam (optioneel)</label><input id="newFormName" name="name" placeholder="Zoals de groep" className="input" /></div>
              <SubmitButton className="btn-primary">Formulier aanmaken</SubmitButton>
            </form>
          </section>

          <section id="groepen" className="card scroll-mt-6 p-5">
            <h2 className="text-lg">Gastengroepen</h2>
            <p className="mt-1 text-sm text-muted">Een eigen groep (bijvoorbeeld Middaggasten) werkt overal hetzelfde: eigen blok in de gastenlijst, te kiezen bij de opstelling en eigen regels bij eten en allergieën.</p>
            <ul className="mt-3 space-y-1.5">
              {groups.map((g, i) => (
                <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-cream px-3 py-1.5 text-sm">
                  <form action={saveGroup} className="flex flex-1 items-center gap-2">
                    {hidden}
                    <input type="hidden" name="groupId" value={g.id} />
                    <input name="name" defaultValue={g.name} aria-label="Naam van de groep" className="input flex-1 py-1" />
                    <SubmitButton className="btn-ghost py-1 text-xs">Hernoemen</SubmitButton>
                  </form>
                  <MoveButtons action={moveGroup} id={g.id} first={i === 0} last={i === groups.length - 1} extra={{ coupleId: couple.id }} />
                  {g.kind === "custom" && (
                    <form action={deleteGroup}>
                      {hidden}
                      <input type="hidden" name="groupId" value={g.id} />
                      <SubmitButton className="text-xs text-muted hover:text-bordeaux" confirm={`Groep "${g.name}" verwijderen?`}>Verwijderen</SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            <form action={saveGroup} className="mt-3 flex flex-wrap gap-2">
              {hidden}
              <input name="name" required placeholder="Nieuwe groep, bijvoorbeeld Middaggasten" aria-label="Nieuwe groep" className="input flex-1" />
              <SubmitButton className="btn-secondary">Groep toevoegen</SubmitButton>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
