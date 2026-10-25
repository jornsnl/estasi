import Link from "next/link";
import { notFound } from "next/navigation";
import { addBlock, deleteBlock, moveBlock, updateBlock, updateLesson } from "@/app/actions/content";
import { Badge } from "@/components/Badge";
import { Markdown } from "@/components/Markdown";
import { MoveButtons } from "@/components/MoveButtons";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { VideoEmbed } from "@/components/VideoEmbed";
import { getStore, type Block } from "@/lib/data";
import { ACCEPT_ATTR } from "@/lib/uploads";
import { formatBytes } from "@/lib/util/format";

export const metadata = { title: "Les bewerken" };

const BLOCK_LABEL: Record<Block["type"], string> = {
  video: "Lesvideo",
  text: "Tekst",
  download: "Download of link",
  question: "Vraag",
  choice: "Meerkeuze",
  upload: "Bestand inleveren",
};

const ADD_OPTIONS: { type: Block["type"]; kind?: string; label: string }[] = [
  { type: "video", label: "Video" },
  { type: "text", label: "Tekst" },
  { type: "download", label: "Download / link" },
  { type: "question", kind: "open", label: "Open vraag" },
  { type: "question", kind: "reflection", label: "Reflectievraag" },
  { type: "question", kind: "practice", label: "Praktijkopdracht" },
  { type: "choice", label: "Meerkeuze" },
  { type: "upload", label: "Bestand inleveren" },
];

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
    <div className="max-w-3xl space-y-8">
      <header>
        <Link href={`/beheer/inhoud#${lesson.moduleId}`} className="text-sm text-muted hover:text-bordeaux">← Lesinhoud</Link>
        <h1 className="mt-3 text-4xl">{lesson.title}</h1>
        <p className="mt-1 text-sm text-muted">Volgorde voor de cursist: titel, dan de blokken hieronder van boven naar beneden.</p>
      </header>
      <Notice searchParams={searchParams} />

      <form action={updateLesson} className="card space-y-4 p-6">
        <input type="hidden" name="id" value={lesson.id} />
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
        <SubmitButton className="btn-secondary">Les opslaan</SubmitButton>
      </form>

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
                <MoveButtons action={moveBlock} id={block.id} first={i === 0} last={i === lesson.blocks.length - 1} extra={{ lessonId: lesson.id }} />
                <form action={deleteBlock}>
                  <input type="hidden" name="lessonId" value={lesson.id} />
                  <input type="hidden" name="blockId" value={block.id} />
                  <SubmitButton className="btn-ghost px-2 text-xs text-bordeaux" confirm="Dit blok verwijderen?">Verwijderen</SubmitButton>
                </form>
              </div>
            </div>
            <BlockForm lessonId={lesson.id} block={block} />
          </div>
        ))}
      </section>

      <section className="card border-dashed p-5">
        <h2 className="text-xl">Blok toevoegen</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {ADD_OPTIONS.map((option) => (
            <form key={option.label} action={addBlock}>
              <input type="hidden" name="lessonId" value={lesson.id} />
              <input type="hidden" name="type" value={option.type} />
              {option.kind && <input type="hidden" name="kind" value={option.kind} />}
              <SubmitButton className="btn-secondary px-3 py-2">+ {option.label}</SubmitButton>
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}

function BlockForm({ lessonId, block }: { lessonId: string; block: Block }) {
  const hidden = (
    <>
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="blockId" value={block.id} />
    </>
  );
  const flags = "required" in block && (
    <div className="flex flex-wrap gap-5 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" name="required" defaultChecked={block.required} className="accent-[#722F37]" /> Verplicht om de les af te ronden
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="feedback" defaultChecked={block.feedback} className="accent-[#722F37]" /> Ik geef feedback op deze opdracht
      </label>
    </div>
  );
  const promptFields = "prompt" in block && (
    <>
      <div>
        <label className="label" htmlFor={`prompt-${block.id}`}>Vraag of opdracht</label>
        <textarea id={`prompt-${block.id}`} name="prompt" rows={2} defaultValue={block.prompt} required className="input" />
      </div>
      <div>
        <label className="label" htmlFor={`help-${block.id}`}>Toelichting (optioneel)</label>
        <input id={`help-${block.id}`} name="helpText" defaultValue={block.helpText} className="input" />
      </div>
    </>
  );

  return (
    <form action={updateBlock} className="space-y-3">
      {hidden}
      {block.type === "video" && (
        <>
          <div>
            <label className="label" htmlFor={`url-${block.id}`}>Videolink (Vimeo, YouTube of mp4)</label>
            <input id={`url-${block.id}`} name="url" type="url" defaultValue={block.url} className="input" placeholder="https://vimeo.com/…" />
          </div>
          <div>
            <label className="label" htmlFor={`cap-${block.id}`}>Onderschrift (optioneel)</label>
            <input id={`cap-${block.id}`} name="caption" defaultValue={block.caption} className="input" />
          </div>
          {block.url && <VideoEmbed url={block.url} title={block.caption || "Voorbeeld"} />}
        </>
      )}
      {block.type === "text" && (
        <>
          <textarea name="markdown" rows={10} defaultValue={block.markdown} className="input font-mono text-sm" aria-label="Tekst" />
          <p className="hint">
            Opmaak: **vet**, *cursief*, ## Kopje, - opsomming, [linktekst](https://…). Lege regel = nieuwe alinea.
          </p>
          {block.markdown && (
            <details>
              <summary className="cursor-pointer text-sm text-bordeaux">Voorbeeld bekijken</summary>
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
              <label className="label" htmlFor={`lbl-${block.id}`}>Titel</label>
              <input id={`lbl-${block.id}`} name="label" defaultValue={block.label} className="input" />
            </div>
            <div>
              <label className="label" htmlFor={`desc-${block.id}`}>Omschrijving</label>
              <input id={`desc-${block.id}`} name="description" defaultValue={block.description} className="input" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor={`url-${block.id}`}>Externe link (of upload hieronder een bestand)</label>
            <input id={`url-${block.id}`} name="url" type="url" defaultValue={block.url} className="input" />
          </div>
          {block.file ? (
            <p className="text-sm">
              Bestand: <a href={`/api/bestanden/${block.file.id}`} className="text-bordeaux underline">{block.file.name}</a> ({formatBytes(block.file.size)})
              <label className="ml-3 inline-flex items-center gap-1 text-muted">
                <input type="checkbox" name="removeFile" /> verwijderen
              </label>
            </p>
          ) : null}
          <input type="file" name="file" accept={ACCEPT_ATTR} className="text-sm" />
        </>
      )}
      {block.type === "question" && (
        <>
          <div>
            <label className="label" htmlFor={`kind-${block.id}`}>Soort vraag</label>
            <select id={`kind-${block.id}`} name="kind" defaultValue={block.kind} className="input w-56">
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
            <label className="label" htmlFor={`opt-${block.id}`}>Antwoordopties (één per regel)</label>
            <textarea id={`opt-${block.id}`} name="options" rows={4} defaultValue={block.options.join("\n")} className="input" />
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
      <SubmitButton className="btn-primary py-2" pendingText="Opslaan…">Blok opslaan</SubmitButton>
    </form>
  );
}
