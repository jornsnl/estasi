import { manageTemplate } from "@/app/actions/ws-fase2";
import { saveTemplateClosing, saveTemplateSection } from "@/app/actions/ws-styling";
import { AutoTextarea } from "@/components/ws/AutoTextarea";
import { FileUpload } from "@/components/ws/FileUpload";
import { directUploads } from "@/lib/ws/files";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { query } from "@/lib/ws/db";

export const metadata = { title: "Opdrachten" };

interface Template {
  id: string;
  title: string;
  intro: string;
  styling_source: boolean;
  archived: boolean;
  kind: "questions" | "sections";
  closing: string;
}

interface TemplateSection {
  id: string;
  template_id: string;
  title: string;
  intro: string;
  kind: "notes" | "moodboard";
  fields: { label: string; prompts: string[] }[];
  tips: string[];
  embeds: string[];
  example_file_id: string | null;
  notice: string;
}

/** Note fields as text: "## Ceremonie" starts a field with a heading, the lines under it are its questions. */
const fieldsText = (fields: TemplateSection["fields"]) =>
  fields.map((f) => [f.label ? `## ${f.label}` : "", ...f.prompts].filter(Boolean).join("\n")).join("\n\n");

/** Sabine's standard assignments; each new couple gets a copy (h9.10). */
export default async function Templates({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [templates, questions, sections] = await Promise.all([
    query<Template>("select * from assignment_templates order by archived, position"),
    query<TemplateSection>("select * from assignment_template_sections order by position"),
    query<{ id: string; template_id: string; prompt: string; help: string }>("select * from assignment_template_questions order by position"),
  ]).then(([t, s, q]) => [t, q, s] as const);
  const direct = directUploads();
  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <p className="eyebrow">Your Wedding Space</p>
        <h1 className="mt-1 text-3xl">Opdrachten</h1>
        <p className="mt-1 text-sm text-muted">Standaardopdrachten. Elk nieuw bruidspaar krijgt een kopie, die je per bruidspaar nog kunt aanpassen. Wijzigingen hier gelden voor nieuwe bruidsparen.</p>
      </header>
      <Notice searchParams={searchParams} />

      {templates.map((t) => {
        const hidden = <><input type="hidden" name="templateId" value={t.id} /></>;
        return (
          <section key={t.id} id={`t-${t.id}`} className={`card scroll-mt-6 space-y-4 p-6 ${t.archived ? "opacity-60" : ""}`}>
            <form action={manageTemplate} className="grid gap-3">
              {hidden}
              <input type="hidden" name="intent" value="save" />
              <input name="title" defaultValue={t.title} aria-label="Titel" className="input font-serif text-lg" />
              <textarea name="intro" rows={2} defaultValue={t.intro} aria-label="Uitleg" placeholder="Uitleg voor het bruidspaar" className="input" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="stylingSource" defaultChecked={t.styling_source} className="accent-[#6B1E2E]" /> Basis voor het stylingplan (AI-concept)</label>
              <div className="flex gap-2">
                <SubmitButton className="btn-primary py-1.5">Opslaan</SubmitButton>
              </div>
            </form>
            {t.kind === "sections" && (
              <div className="space-y-3">
                {sections.filter((x) => x.template_id === t.id).map((x) => (
                  <details key={x.id} id={`s-${x.id}`} className="scroll-mt-6 rounded-xl bg-cream p-4">
                    <summary className="cursor-pointer font-medium">{x.title}</summary>
                    <form action={saveTemplateSection} className="mt-3 space-y-3">
                      <input type="hidden" name="sectionId" value={x.id} />
                      <div><label className="label" htmlFor={`st-${x.id}`}>Titel</label><input id={`st-${x.id}`} name="title" defaultValue={x.title} className="input" /></div>
                      <div><label className="label" htmlFor={`si-${x.id}`}>Uitleg</label><AutoTextarea id={`si-${x.id}`} name="intro" defaultValue={x.intro} className="input" /></div>
                      {x.kind === "notes" ? (
                        <div>
                          <label className="label" htmlFor={`sf-${x.id}`}>Vragen (één per regel; een regel met ## begint een eigen notitieveld, bijvoorbeeld ## Ceremonie)</label>
                          <AutoTextarea id={`sf-${x.id}`} name="fields" defaultValue={fieldsText(x.fields)} className="input font-mono text-xs" />
                        </div>
                      ) : (
                        <>
                          <div><label className="label" htmlFor={`sp-${x.id}`}>Tips (één per regel)</label><AutoTextarea id={`sp-${x.id}`} name="tips" defaultValue={x.tips.join("\n")} className="input" /></div>
                          <div>
                            <label className="label" htmlFor={`se-${x.id}`}>Pinterest-borden (link per regel, bijvoorbeeld https://nl.pinterest.com/estasiweddings/themes-weddings/)</label>
                            <AutoTextarea id={`se-${x.id}`} name="embeds" defaultValue={x.embeds.join("\n")} className="input font-mono text-xs" />
                          </div>
                          <div className="text-sm">
                            <p className="label">Voorbeeldmoodboard</p>
                            {x.example_file_id && (
                              // eslint-disable-next-line @next/next/no-img-element -- uploaded image behind a login check
                              <img src={`/api/ws-bestanden/${x.example_file_id}`} alt="Voorbeeldmoodboard" className="mb-2 max-h-40 rounded-lg" />
                            )}
                            <FileUpload name="example" coupleId={null} kind="image" direct={direct} label={x.example_file_id ? "Ander voorbeeld" : "Voorbeeld uploaden"} />
                            {x.example_file_id && <label className="mt-1 flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="removeExample" /> Voorbeeld weghalen</label>}
                          </div>
                        </>
                      )}
                      <div><label className="label" htmlFor={`sn-${x.id}`}>Opvallende melding (optioneel)</label><AutoTextarea id={`sn-${x.id}`} name="notice" defaultValue={x.notice} className="input" /></div>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="propagate" className="accent-[#6B1E2E]" /> Ook bijwerken bij bruidsparen die deze opdracht al hebben (hun antwoorden blijven staan)</label>
                      <SubmitButton className="btn-primary py-1.5">Opslaan</SubmitButton>
                    </form>
                  </details>
                ))}
                <form action={saveTemplateClosing} className="space-y-2">
                  {hidden}
                  <label className="label" htmlFor={`cl-${t.id}`}>Afsluiting (zodra alles is afgerond)</label>
                  <AutoTextarea id={`cl-${t.id}`} name="closing" defaultValue={t.closing} className="input" />
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="propagate" className="accent-[#6B1E2E]" /> Ook bij bestaande bruidsparen</label>
                  <SubmitButton className="btn-secondary py-1.5">Afsluiting opslaan</SubmitButton>
                </form>
              </div>
            )}
            {t.kind !== "sections" && <>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm">
              {questions.filter((q) => q.template_id === t.id).map((q) => (
                <li key={q.id}>
                  <div className="flex items-start justify-between gap-2">
                    <span>{q.prompt}{q.help && <span className="block text-xs text-muted">{q.help}</span>}</span>
                    <form action={manageTemplate}>
                      {hidden}
                      <input type="hidden" name="intent" value="deleteQuestion" />
                      <input type="hidden" name="questionId" value={q.id} />
                      <SubmitButton className="text-xs text-muted hover:text-bordeaux" confirm="Deze vraag verwijderen?">Verwijderen</SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ol>
            <form action={manageTemplate} className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
              {hidden}
              <input type="hidden" name="intent" value="addQuestion" />
              <input name="prompt" required placeholder="Nieuwe vraag" aria-label="Nieuwe vraag" className="input py-1.5" />
              <input name="help" placeholder="Toelichting (optioneel)" aria-label="Toelichting" className="input py-1.5" />
              <SubmitButton className="btn-secondary py-1.5">Toevoegen</SubmitButton>
            </form>
            </>}
            <form action={manageTemplate}>
              {hidden}
              <input type="hidden" name="intent" value="archive" />
              <SubmitButton className="btn-ghost px-0 text-xs">{t.archived ? "Weer gebruiken voor nieuwe bruidsparen" : "Niet meer gebruiken voor nieuwe bruidsparen"}</SubmitButton>
            </form>
          </section>
        );
      })}

      <form action={manageTemplate} className="card flex flex-wrap gap-2 p-5">
        <input type="hidden" name="intent" value="create" />
        <input name="title" required placeholder="Titel nieuwe opdracht" aria-label="Titel nieuwe opdracht" className="input flex-1" />
        <SubmitButton className="btn-primary">Opdracht toevoegen</SubmitButton>
      </form>
    </div>
  );
}
