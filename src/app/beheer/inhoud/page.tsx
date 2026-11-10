import { plural } from "@/lib/domain/labels";
import Link from "next/link";
import {
  copyLesson,
  createLesson,
  createModule,
  deleteLesson,
  deleteModule,
  moveLesson,
  moveLessonToModule,
  moveModule,
  setModuleStatus,
  updateModule,
} from "@/app/actions/content";
import { Badge } from "@/components/Badge";
import { MoveButtons } from "@/components/MoveButtons";
import { Notice } from "@/components/Notice";
import { PhotoInput } from "@/components/PhotoInput";
import { SubmitButton } from "@/components/SubmitButton";
import { getStore, type ModulePackages } from "@/lib/data";
import { isContentBlock } from "@/lib/domain/blocks";
import { LIMITS } from "@/lib/domain/input";
import { editableContent, hasPendingChanges } from "@/lib/domain/publishing";
import { isPublished, MODULE_PACKAGE_LABELS, MODULE_PACKAGE_OPTIONS } from "@/lib/domain/visibility";

export const metadata = { title: "Lesinhoud" };

function PackageSelect({ id, defaultValue }: { id: string; defaultValue: ModulePackages }) {
  return (
    <div>
      <label className="label" htmlFor={id}>Zichtbaar voor</label>
      <select id={id} name="packages" defaultValue={defaultValue} className="input sm:w-64">
        {MODULE_PACKAGE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const store = getStore();
  const [modules, lessons] = await Promise.all([store.listModules(), store.listLessons()]);

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Beheer</p>
        <h1 className="mt-1 text-4xl">Lesinhoud</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Voeg modules en lessen toe en zet ze in de juiste volgorde. Concepten zie alleen jij; cursisten zien een module of les pas als
          die gepubliceerd is, en alleen als de module voor hun pakket is. Een module komt vrij zodra alle lessen van de vorige module zijn
          afgerond.
        </p>
      </header>
      <Notice searchParams={searchParams} />

      <ol className="space-y-5">
        {modules.map((module, i) => {
          const moduleLessons = lessons.filter((l) => l.moduleId === module.id);
          const published = isPublished(module);
          const packages = module.packages ?? "AB";
          return (
            <li key={module.id} id={module.id} className={`card scroll-mt-20 p-5 sm:p-6 ${published ? "" : "border-dashed bg-cream/40"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="eyebrow">Module {i + 1}</p>
                    {published ? <Badge tone="success">Gepubliceerd</Badge> : <Badge>Concept</Badge>}
                    <Badge tone={packages === "AB" ? "neutral" : "gold"}>{MODULE_PACKAGE_LABELS[packages]}</Badge>
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer list-none">
                      <span className="font-serif text-2xl">{module.title}</span>
                      <span className="ml-2 text-sm text-bordeaux">bewerken</span>
                    </summary>
                    <form action={updateModule} className="mt-3 space-y-3">
                      <input type="hidden" name="id" value={module.id} />
                      <input name="title" defaultValue={module.title} required maxLength={LIMITS.moduleTitle} className="input" aria-label="Titel" />
                      <textarea name="description" defaultValue={module.description} rows={2} maxLength={LIMITS.moduleDescription} className="input" aria-label="Omschrijving" />
                      <PackageSelect id={`packages-${module.id}`} defaultValue={packages} />
                      <div className="flex flex-wrap items-center gap-4">
                        {module.imageFileId && (
                          // eslint-disable-next-line @next/next/no-img-element -- private file behind /api/bestanden
                          <img src={`/api/bestanden/${module.imageFileId}`} alt="" className="h-20 w-20 rounded-2xl border border-line object-cover" />
                        )}
                        <div className="space-y-1">
                          <p className="label">{module.imageFileId ? "Andere foto kiezen" : "Foto voor de moduletegel"} (jpg, png, webp)</p>
                          <PhotoInput name="image" label={`Foto voor ${module.title} kiezen`} />
                          {module.imageFileId && (
                            <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="removeImage" /> Foto weghalen</label>
                          )}
                        </div>
                      </div>
                      <SubmitButton className="btn-secondary">Opslaan</SubmitButton>
                    </form>
                  </details>
                  <p className="mt-1 text-sm text-muted">{module.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <form action={setModuleStatus}>
                    <input type="hidden" name="id" value={module.id} />
                    <input type="hidden" name="status" value={published ? "draft" : "published"} />
                    <SubmitButton
                      className={published ? "btn-ghost px-2 text-xs" : "btn-primary px-3 py-1.5 text-xs"}
                      confirm={published ? `Module "${module.title}" terugzetten naar concept? Cursisten zien de module dan niet meer; hun voortgang blijft bewaard.` : undefined}
                    >
                      {published ? "Naar concept" : "Publiceren"}
                    </SubmitButton>
                  </form>
                  <MoveButtons action={moveModule} id={module.id} first={i === 0} last={i === modules.length - 1} />
                  <form action={deleteModule}>
                    <input type="hidden" name="id" value={module.id} />
                    <SubmitButton className="btn-ghost text-bordeaux" confirm={`Module "${module.title}" en alle lessen erin verwijderen? Antwoorden van cursisten blijven bewaard.`}>
                      Verwijderen
                    </SubmitButton>
                  </form>
                </div>
              </div>

              <ul className="mt-4 divide-y divide-line border-t border-line">
                {moduleLessons.length === 0 && <li className="py-3 text-sm text-muted">Nog geen lessen in deze module.</li>}
                {moduleLessons.map((lesson, j) => {
                  const content = editableContent(lesson);
                  return (
                    <li key={lesson.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <Link href={`/beheer/inhoud/les/${lesson.id}`} className="min-w-0 flex-1 hover:text-bordeaux">
                        <span className="font-medium">{j + 1}. {content.title}</span>
                        <span className="ml-2 inline-flex flex-wrap items-center gap-1.5 align-middle">
                          {!isPublished(lesson) && <Badge>Concept</Badge>}
                          {hasPendingChanges(lesson) && <Badge tone="gold">Niet-gepubliceerde wijzigingen</Badge>}
                        </span>
                        <span className="block text-sm text-muted sm:ml-2 sm:inline">
                          {plural(content.blocks.length, "blok", "blokken")} · {plural(content.blocks.filter((b) => !isContentBlock(b)).length, "opdracht", "opdrachten")}
                        </span>
                      </Link>
                      <div className="flex flex-wrap items-center gap-1">
                        <MoveButtons action={moveLesson} id={lesson.id} first={j === 0} last={j === moduleLessons.length - 1} />
                        <Link href={`/beheer/inhoud/les/${lesson.id}`} className="btn-secondary px-3 py-1.5 text-xs">Bewerken</Link>
                        <Link href={`/beheer/inhoud/les/${lesson.id}/voorbeeld`} className="btn-ghost px-2 text-xs">Voorbeeld</Link>
                        <form action={copyLesson}>
                          <input type="hidden" name="id" value={lesson.id} />
                          <SubmitButton className="btn-ghost px-2 text-xs">Kopiëren</SubmitButton>
                        </form>
                        {modules.length > 1 && (
                          <details className="relative">
                            <summary className="btn-ghost cursor-pointer list-none px-2 text-xs">Verplaatsen</summary>
                            <form action={moveLessonToModule} className="absolute right-0 z-10 mt-1 w-72 space-y-2 rounded-lg border border-line bg-white p-3 shadow-lg">
                              <input type="hidden" name="id" value={lesson.id} />
                              <label className="label" htmlFor={`move-${lesson.id}`}>Naar module</label>
                              <select id={`move-${lesson.id}`} name="moduleId" defaultValue={module.id} className="input">
                                {modules.map((m, k) => (
                                  <option key={m.id} value={m.id}>Module {k + 1}: {m.title}</option>
                                ))}
                              </select>
                              <SubmitButton className="btn-secondary w-full">Verplaatsen</SubmitButton>
                            </form>
                          </details>
                        )}
                        <form action={deleteLesson}>
                          <input type="hidden" name="id" value={lesson.id} />
                          <SubmitButton className="btn-ghost px-2 text-xs text-bordeaux" confirm={`Les "${content.title}" verwijderen?`}>
                            Verwijderen
                          </SubmitButton>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <form action={createLesson} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="moduleId" value={module.id} />
                <input name="title" required maxLength={LIMITS.lessonTitle} placeholder="Titel nieuwe les" className="input max-w-sm flex-1" aria-label="Titel nieuwe les" />
                <SubmitButton className="btn-secondary">Les toevoegen</SubmitButton>
              </form>
            </li>
          );
        })}
      </ol>

      <section className="card p-6">
        <h2 className="text-2xl">Nieuwe module</h2>
        <form action={createModule} className="mt-3 space-y-3">
          <input name="title" required maxLength={LIMITS.moduleTitle} placeholder="Titel" className="input" aria-label="Titel" />
          <textarea name="description" rows={2} maxLength={LIMITS.moduleDescription} placeholder="Korte omschrijving" className="input" aria-label="Omschrijving" />
          <div className="flex flex-wrap gap-4">
            <PackageSelect id="packages-new" defaultValue="AB" />
            <div>
              <label className="label" htmlFor="status-new">Status</label>
              <select id="status-new" name="status" defaultValue="draft" className="input sm:w-64">
                <option value="draft">Concept (alleen voor jou zichtbaar)</option>
                <option value="published">Direct publiceren</option>
              </select>
            </div>
          </div>
          <SubmitButton>Module toevoegen</SubmitButton>
        </form>
      </section>
    </div>
  );
}
