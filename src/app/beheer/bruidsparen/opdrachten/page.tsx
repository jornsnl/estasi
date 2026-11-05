import { manageTemplate } from "@/app/actions/ws-fase2";
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
}

/** Sabine's standard assignments; each new couple gets a copy (h9.10). */
export default async function Templates({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [templates, questions] = await Promise.all([
    query<Template>("select * from assignment_templates order by archived, position"),
    query<{ id: string; template_id: string; prompt: string; help: string }>("select * from assignment_template_questions order by position"),
  ]);
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
