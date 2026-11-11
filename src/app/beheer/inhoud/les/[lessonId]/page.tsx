import { stripInlineFormat } from "@/lib/domain/inline-format";
import Link from "next/link";
import { notFound } from "next/navigation";
import { copyLesson, saveLessonEditor } from "@/app/actions/content";
import { BlockFields } from "@/components/academy/BlockFields";
import { SortableBlocks } from "@/components/academy/SortableBlocks";
import { Badge } from "@/components/Badge";
import { DirtyGuard } from "@/components/DirtyGuard";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { getStore, type AssignmentBlock, type Lesson, type Module } from "@/lib/data";
import type { AssignmentChoice } from "@/components/academy/AssignmentEditor";
import { ADD_BLOCK_OPTIONS, BLOCK_LABELS } from "@/lib/domain/blocks";
import { LIMITS } from "@/lib/domain/input";
import { editableContent, hasPendingChanges } from "@/lib/domain/publishing";
import { isPublished, MODULE_PACKAGE_LABELS } from "@/lib/domain/visibility";
import { formatDateTime } from "@/lib/util/format";

export const metadata = { title: "Les bewerken" };

const FORM_ID = "lesson-editor";

/**
 * The whole lesson is one form. Adding and deleting blocks also save
 * everything typed so far, so no edit gets lost. Moving blocks (dragging or
 * arrows) happens on the page and is saved with the next save.
 * A published lesson is edited as a concept: students keep the live version
 * until "Publiceren".
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
  const [lesson, modules, allLessons] = await Promise.all([store.getLesson(lessonId), store.listModules(), store.listLessons()]);
  if (!lesson) notFound();
  const content = editableContent(lesson);
  const published = isPublished(lesson);
  const pending = hasPendingChanges(lesson);
  const editorContext = { assignments: assignmentChoices(modules, allLessons) };
  const parent = modules.find((m) => m.id === lesson.moduleId);

  return (
    <div className="max-w-3xl">
      <header className="mb-8">
        <Link href={`/beheer/inhoud#${lesson.moduleId}`} className="text-sm text-muted hover:text-bordeaux">← Lesinhoud</Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-4xl">{content.title}</h1>
          {published ? <Badge tone="success">Gepubliceerd</Badge> : <Badge>Concept</Badge>}
          {pending && <Badge tone="gold">Niet-gepubliceerde wijzigingen</Badge>}
        </div>
        <p className="mt-2 text-sm text-muted">
          {published
            ? pending
              ? "Cursisten zien nog de gepubliceerde versie. Je wijzigingen gaan live als je op Publiceren drukt."
              : `Gepubliceerd${lesson.publishedAt ? ` op ${formatDateTime(lesson.publishedAt)}` : ""}. Wat je nu wijzigt, wordt eerst als concept bewaard.`
            : "Deze les is een concept: cursisten zien hem pas als je hem publiceert."}
          {parent && !isPublished(parent) && " Let op: de module zelf is ook nog een concept."}
          {parent && ` Module voor: ${MODULE_PACKAGE_LABELS[parent.packages ?? "AB"].toLowerCase()}.`}
        </p>
      </header>
      <Notice searchParams={searchParams} />

      <form id={FORM_ID} action={saveLessonEditor} className="space-y-8">
        {/* First submit button in the form: pressing Enter in a field saves, it never adds or deletes a block. */}
        <button type="submit" name="intent" value="save" tabIndex={-1} aria-hidden="true" className="absolute h-0 w-0 overflow-hidden opacity-0" />
        {/* Never name a field "id" in a form that has an id: form.id would then be that field, and
            React drops the pressed button (intent) from the submitted data. */}
        <input type="hidden" name="lessonId" value={lesson.id} />

        <section className="card space-y-4 p-6">
          <div>
            <label htmlFor="title" className="label">Titel</label>
            <input id="title" name="title" defaultValue={content.title} required maxLength={LIMITS.lessonTitle} className="input" />
          </div>
          <div>
            <label htmlFor="summary" className="label">Korte omschrijving</label>
            <input id="summary" name="summary" defaultValue={content.summary} maxLength={LIMITS.lessonSummary} className="input" />
          </div>
          <div>
            <label htmlFor="moduleId" className="label">Module</label>
            <select id="moduleId" name="moduleId" defaultValue={lesson.moduleId} className="input">
              {modules.map((m, i) => (
                <option key={m.id} value={m.id}>Module {i + 1}: {m.title}{isPublished(m) ? "" : " (concept)"}</option>
              ))}
            </select>
            <p className="hint">Een andere module kiezen verplaatst de les direct bij het opslaan (achteraan in die module).</p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-3xl">Blokken</h2>
          {content.blocks.length === 0 && <p className="text-muted">Nog geen blokken. Voeg hieronder je eerste blok toe.</p>}
          <SortableBlocks
            formId={FORM_ID}
            items={content.blocks.map((block) => ({
              id: block.id,
              label: BLOCK_LABELS[block.type] ?? "Blok",
              node: (
                <div key={block.id} id={`blok-${block.id}`} className="card scroll-mt-20 p-5">
                  <div className="mb-3 flex flex-wrap items-center gap-2 pr-28 sm:pr-32">
                    <span className="eyebrow">{BLOCK_LABELS[block.type] ?? block.type}</span>
                    {"required" in block && typeof block.required === "boolean" && (
                      <Badge tone={block.required ? "bordeaux" : "neutral"}>{block.required ? "Verplicht" : "Optioneel"}</Badge>
                    )}
                    {"feedback" in block && block.feedback === true && <Badge tone="gold">Feedback</Badge>}
                  </div>
                  <input type="hidden" name={`b.${block.id}.present`} value="1" />
                  <BlockFields block={block} context={editorContext} />
                  <div className="mt-4 flex justify-end border-t border-line pt-3">
                    <SubmitButton name="intent" value={`delete:${block.id}`} className="btn-ghost px-2 text-xs text-bordeaux" confirm="Dit blok verwijderen? Je andere wijzigingen worden opgeslagen.">
                      Blok verwijderen
                    </SubmitButton>
                  </div>
                </div>
              ),
            }))}
          />
        </section>

        <section className="card border-dashed p-5">
          <h2 className="text-xl">Blok toevoegen</h2>
          <p className="mt-1 text-sm text-muted">Een les kan zoveel tekstblokken, video&apos;s, afbeeldingen en opdrachten bevatten als je wilt. Je wijzigingen hierboven worden daarbij ook opgeslagen.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ADD_BLOCK_OPTIONS.map((option) => (
              <SubmitButton key={option.intent} name="intent" value={option.intent} className="btn-secondary px-3 py-2">+ {option.label}</SubmitButton>
            ))}
          </div>
        </section>

        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:gap-3">
          <DirtyGuard formId={FORM_ID} />
          {pending && (
            <SubmitButton name="intent" value="discard" className="btn-ghost text-bordeaux" confirm="Alle wijzigingen sinds de laatste publicatie weggooien? Cursisten blijven de gepubliceerde versie zien.">
              Wijzigingen weggooien
            </SubmitButton>
          )}
          <SubmitButton name="intent" value="preview" className="btn-ghost" pendingText="Opslaan…">Voorbeeld als cursist</SubmitButton>
          <SubmitButton name="intent" value="save" className="btn-secondary" pendingText="Opslaan…">
            {published ? "Opslaan als concept" : "Opslaan"}
          </SubmitButton>
          <SubmitButton name="intent" value="publish" className="btn-primary" pendingText="Publiceren…">
            {published ? "Wijzigingen publiceren" : "Publiceren"}
          </SubmitButton>
        </div>
      </form>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <form action={copyLesson} className="card space-y-3 p-5">
          <h2 className="text-xl">Les kopiëren</h2>
          <p className="text-sm text-muted">Maakt een concept met dezelfde blokken en opdrachten, zonder antwoorden van cursisten.</p>
          <input type="hidden" name="id" value={lesson.id} />
          <label className="label" htmlFor="copy-module">Naar module</label>
          <select id="copy-module" name="moduleId" defaultValue={lesson.moduleId} className="input">
            {modules.map((m, i) => (
              <option key={m.id} value={m.id}>Module {i + 1}: {m.title}</option>
            ))}
          </select>
          <SubmitButton className="btn-secondary" confirm={pending ? "De kopie neemt je niet-gepubliceerde wijzigingen mee. Niet-opgeslagen wijzigingen op deze pagina niet. Doorgaan?" : undefined}>
            Kopie maken
          </SubmitButton>
        </form>
        {published && (
          <form action={saveLessonEditor} className="card space-y-3 p-5">
            <h2 className="text-xl">Terug naar concept</h2>
            <p className="text-sm text-muted">De les verdwijnt voor cursisten tot je hem opnieuw publiceert. Antwoorden en voortgang blijven bewaard.</p>
            <input type="hidden" name="lessonId" value={lesson.id} />
            <SubmitButton name="intent" value="unpublish" className="btn-ghost text-bordeaux" confirm="Deze les terugzetten naar concept? Cursisten zien hem dan niet meer.">
              Terugzetten naar concept
            </SubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}

/** Every assignment in the course (as the editor shows it), for "herhaling van" in the assignment editor. */
function assignmentChoices(modules: Module[], lessons: Lesson[]): AssignmentChoice[] {
  return modules.flatMap((m, mi) =>
    lessons
      .filter((l) => l.moduleId === m.id)
      .flatMap((l) => {
        const content = editableContent(l);
        return content.blocks
          .filter((b): b is AssignmentBlock => b.type === "assignment")
          .map((b, i) => ({
            id: b.id,
            label: `Module ${mi + 1} · ${content.title} · ${b.title || stripInlineFormat(b.parts[0]?.fields[0]?.label ?? "").slice(0, 60) || `Opdracht ${i + 1}`}`,
            parts: b.parts,
          }));
      }),
  );
}
