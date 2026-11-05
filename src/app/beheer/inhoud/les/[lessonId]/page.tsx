import Link from "next/link";
import { notFound } from "next/navigation";
import { saveLessonEditor } from "@/app/actions/content";
import { Badge } from "@/components/Badge";
import { DirtyGuard } from "@/components/DirtyGuard";
import { Markdown } from "@/components/Markdown";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { VideoEmbed } from "@/components/VideoEmbed";
import { getStore, type Block } from "@/lib/data";
import { ACCEPT_ATTR } from "@/lib/uploads";
import { formatBytes } from "@/lib/util/format";

export const metadata = { title: "Les bewerken" };

const FORM_ID = "lesson-editor";

const BLOCK_LABEL: Record<Block["type"], string> = {
  video: "Lesvideo",
  text: "Tekst",
  download: "Download of link",
  question: "Vraag",
  choice: "Meerkeuze",
  upload: "Bestand inleveren",
};

const ADD_OPTIONS: { intent: string; label: string }[] = [
  { intent: "add:video", label: "Video" },
  { intent: "add:text", label: "Tekst" },
  { intent: "add:download", label: "Download / link" },
  { intent: "add:question:open", label: "Open vraag" },
  { intent: "add:question:reflection", label: "Reflectievraag" },
  { intent: "add:question:practice", label: "Praktijkopdracht" },
  { intent: "add:choice", label: "Meerkeuze" },
  { intent: "add:upload", label: "Bestand inleveren" },
];

/**
 * The whole lesson is one form with one save button. Adding, moving and
 * deleting blocks also save everything typed so far, so no edit gets lost.
 */
export default async function LessonEditor({
  params,
  searchParams,
}: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lessonId } = await params;
  const store = getStore();
  const [lesson, modules] = await Promise.all([store.getLesson(lessonId), store.listModules()]);
  if (!lesson) notFound();

  return (
    <div className="max-w-3xl">
      <header className="mb-8">
        <Link href={`/beheer/inhoud#${lesson.moduleId}`} className="text-sm text-muted hover:text-bordeaux">← Lesinhoud</Link>
        <h1 className="mt-3 text-4xl">{lesson.title}</h1>
        <p className="mt-1 text-sm text-muted">Volgorde voor de cursist: titel, dan de blokken hieronder van boven naar beneden.</p>
      </header>
      <Notice searchParams={searchParams} />

      <form id={FORM_ID} action={saveLessonEditor} className="space-y-8">
        {/* First submit button in the form: pressing Enter in a field saves, it never moves or deletes a block. */}
        <button type="submit" name="intent" value="save" tabIndex={-1} aria-hidden="true" className="absolute h-0 w-0 overflow-hidden opacity-0" />
        <input type="hidden" name="id" value={lesson.id} />

        <section className="card space-y-4 p-6">
          <div>
            <label htmlFor="title" className="label">Titel</label>
            <input id="title" name="title" defaultValue={lesson.title} required className="input" />
          </div>
          <div>
            <label htmlFor="summary" className="label">Korte omschrijving</label>
            <input id="summary" name="summary" defaultValue={lesson.summary} className="input" />
          </div>
          <div>
            <label htmlFor="moduleId" className="label">Module</label>
            <select id="moduleId" name="moduleId" defaultValue={lesson.moduleId} className="input">
              {modules.map((m, i) => (
                <option key={m.id} value={m.id}>Module {i + 1}: {m.title}</option>
              ))}
            </select>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-3xl">Blokken</h2>
          {lesson.blocks.length === 0 && <p className="text-muted">Nog geen blokken. Voeg hieronder je eerste blok toe.</p>}
          {lesson.blocks.map((block, i) => (
            <div key={block.id} id={`blok-${block.id}`} className="card scroll-mt-20 p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted">{i + 1}.</span>
                  <span className="eyebrow">{BLOCK_LABEL[block.type]}</span>
                  {"required" in block && <Badge tone={block.required ? "bordeaux" : "neutral"}>{block.required ? "Verplicht" : "Optioneel"}</Badge>}
                  {"feedback" in block && block.feedback && <Badge tone="gold">Feedback</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  <button type="submit" name="intent" value={`move:${block.id}:up`} disabled={i === 0} className="btn-ghost px-2 py-1.5 disabled:opacity-25" aria-label="Omhoog" title="Omhoog">↑</button>
                  <button type="submit" name="intent" value={`move:${block.id}:down`} disabled={i === lesson.blocks.length - 1} className="btn-ghost px-2 py-1.5 disabled:opacity-25" aria-label="Omlaag" title="Omlaag">↓</button>
                  <SubmitButton name="intent" value={`delete:${block.id}`} className="btn-ghost px-2 text-xs text-bordeaux" confirm="Dit blok verwijderen? Je andere wijzigingen worden opgeslagen.">
                    Verwijderen
                  </SubmitButton>
                </div>
              </div>
              <input type="hidden" name={`b.${block.id}.present`} value="1" />
              <BlockFields block={block} />
            </div>
          ))}
        </section>

        <section className="card border-dashed p-5">
          <h2 className="text-xl">Blok toevoegen</h2>
          <p className="mt-1 text-sm text-muted">Je wijzigingen hierboven worden daarbij ook opgeslagen.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ADD_OPTIONS.map((option) => (
              <SubmitButton key={option.intent} name="intent" value={option.intent} className="btn-secondary px-3 py-2">+ {option.label}</SubmitButton>
            ))}
          </div>
        </section>

        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-4 border-t border-line bg-white/95 px-4 py-3 backdrop-blur">
          <DirtyGuard formId={FORM_ID} />
          <SubmitButton name="intent" value="save" className="btn-primary" pendingText="Opslaan…">Les opslaan</SubmitButton>
        </div>
      </form>
    </div>
  );
}

function BlockFields({ block }: { block: Block }) {
  const n = (field: string) => `b.${block.id}.${field}`;
  const id = (field: string) => `${field}-${block.id}`;
  const flags = "required" in block && (
    <div className="flex flex-wrap gap-5 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" name={n("required")} defaultChecked={block.required} className="accent-[#722F37]" /> Verplicht om de les af te ronden
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" name={n("feedback")} defaultChecked={block.feedback} className="accent-[#722F37]" /> Ik geef feedback op deze opdracht
      </label>
    </div>
  );
  const promptFields = "prompt" in block && (
    <>
      <div>
        <label className="label" htmlFor={id("prompt")}>Vraag of opdracht</label>
        <textarea id={id("prompt")} name={n("prompt")} rows={2} defaultValue={block.prompt} className="input" />
      </div>
      <div>
        <label className="label" htmlFor={id("help")}>Toelichting (optioneel)</label>
        <input id={id("help")} name={n("helpText")} defaultValue={block.helpText} className="input" />
      </div>
    </>
  );

  return (
    <div className="space-y-3">
      {block.type === "video" && (
        <>
          <div>
            <label className="label" htmlFor={id("url")}>Videolink (Vimeo, YouTube of mp4)</label>
            <input id={id("url")} name={n("url")} type="url" defaultValue={block.url} className="input" placeholder="https://vimeo.com/…" />
          </div>
          <div>
            <label className="label" htmlFor={id("cap")}>Onderschrift (optioneel)</label>
            <input id={id("cap")} name={n("caption")} defaultValue={block.caption} className="input" />
          </div>
          {block.url && <VideoEmbed url={block.url} title={block.caption || "Voorbeeld"} />}
        </>
      )}
      {block.type === "text" && (
        <>
          <MarkdownEditor name={n("markdown")} defaultValue={block.markdown} label="Tekst" />
          <p className="hint">Gebruik de knoppen voor opmaak. Een lege regel begint een nieuwe alinea.</p>
          {block.markdown && (
            <details>
              <summary className="cursor-pointer text-sm text-bordeaux">Voorbeeld bekijken (laatst opgeslagen versie)</summary>
              <div className="mt-2 rounded-lg border border-line p-4">
                <Markdown>{block.markdown}</Markdown>
              </div>
            </details>
          )}
        </>
      )}
      {block.type === "download" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={id("lbl")}>Titel</label>
              <input id={id("lbl")} name={n("label")} defaultValue={block.label} className="input" />
            </div>
            <div>
              <label className="label" htmlFor={id("desc")}>Omschrijving</label>
              <input id={id("desc")} name={n("description")} defaultValue={block.description} className="input" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor={id("url")}>Externe link (of upload hieronder een bestand)</label>
            <input id={id("url")} name={n("url")} type="url" defaultValue={block.url} className="input" />
          </div>
          {block.file ? (
            <p className="text-sm">
              Bestand: <a href={`/api/bestanden/${block.file.id}`} className="text-bordeaux underline">{block.file.name}</a> ({formatBytes(block.file.size)})
              <label className="ml-3 inline-flex items-center gap-1 text-muted">
                <input type="checkbox" name={n("removeFile")} /> verwijderen
              </label>
            </p>
          ) : null}
          <input type="file" name={n("file")} accept={ACCEPT_ATTR} className="text-sm" aria-label="Bestand uploaden" />
        </>
      )}
      {block.type === "question" && (
        <>
          <div>
            <label className="label" htmlFor={id("kind")}>Soort vraag</label>
            <select id={id("kind")} name={n("kind")} defaultValue={block.kind} className="input w-56">
              <option value="open">Open vraag</option>
              <option value="reflection">Reflectievraag</option>
              <option value="practice">Praktijkopdracht</option>
            </select>
          </div>
          {promptFields}
          {flags}
        </>
      )}
      {block.type === "choice" && (
        <>
          {promptFields}
          <div>
            <label className="label" htmlFor={id("opt")}>Antwoordopties (één per regel)</label>
            <textarea id={id("opt")} name={n("options")} rows={4} defaultValue={block.options.join("\n")} className="input" />
            <p className="hint">Er is geen goed of fout antwoord; de keuze wordt alleen bewaard.</p>
          </div>
          {flags}
        </>
      )}
      {block.type === "upload" && (
        <>
          {promptFields}
          {flags}
        </>
      )}
    </div>
  );
}
