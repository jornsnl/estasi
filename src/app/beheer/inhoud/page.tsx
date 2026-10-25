import Link from "next/link";
import { createLesson, createModule, deleteLesson, deleteModule, moveLesson, moveModule, updateModule } from "@/app/actions/content";
import { MoveButtons } from "@/components/MoveButtons";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { getStore } from "@/lib/data";
import { isAnswerable } from "@/lib/domain/progress";

export const metadata = { title: "Lesinhoud" };

export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const store = getStore();
  const [modules, lessons] = await Promise.all([store.listModules(), store.listLessons()]);

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Beheer</p>
        <h1 className="mt-1 text-4xl">Lesinhoud</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Voeg modules en lessen toe en zet ze in de juiste volgorde. Een module komt voor cursisten vrij zodra alle lessen van de vorige
          module zijn afgerond.
        </p>
      </header>
      <Notice searchParams={searchParams} />

      <ol className="space-y-5">
        {modules.map((module, i) => {
          const moduleLessons = lessons.filter((l) => l.moduleId === module.id);
          return (
            <li key={module.id} id={module.id} className="card scroll-mt-20 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="eyebrow">Module {i + 1}</p>
                  <details className="mt-1">
                    <summary className="cursor-pointer list-none">
                      <span className="font-serif text-2xl">{module.title}</span>
                      <span className="ml-2 text-sm text-bordeaux">bewerken</span>
                    </summary>
                    <form action={updateModule} className="mt-3 space-y-3">
                      <input type="hidden" name="id" value={module.id} />
                      <input name="title" defaultValue={module.title} required className="input" aria-label="Titel" />
                      <textarea name="description" defaultValue={module.description} rows={2} className="input" aria-label="Omschrijving" />
                      <SubmitButton className="btn-secondary">Opslaan</SubmitButton>
                    </form>
                  </details>
                  <p className="mt-1 text-sm text-muted">{module.description}</p>
                </div>
                <div className="flex items-center gap-1">
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
                {moduleLessons.map((lesson, j) => (
                  <li key={lesson.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <Link href={`/beheer/inhoud/les/${lesson.id}`} className="flex-1 hover:text-bordeaux">
                      <span className="font-medium">{j + 1}. {lesson.title}</span>
                      <span className="ml-2 text-sm text-muted">
                        {lesson.blocks.length} blokken · {lesson.blocks.filter(isAnswerable).length} vragen
                      </span>
                    </Link>
                    <div className="flex items-center gap-1">
                      <MoveButtons action={moveLesson} id={lesson.id} first={j === 0} last={j === moduleLessons.length - 1} />
                      <Link href={`/beheer/inhoud/les/${lesson.id}`} className="btn-secondary px-3 py-1.5 text-xs">Bewerken</Link>
                      <form action={deleteLesson}>
                        <input type="hidden" name="id" value={lesson.id} />
                        <SubmitButton className="btn-ghost px-2 text-xs text-bordeaux" confirm={`Les "${lesson.title}" verwijderen?`}>
                          Verwijderen
                        </SubmitButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>

              <form action={createLesson} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="moduleId" value={module.id} />
                <input name="title" required placeholder="Titel nieuwe les" className="input max-w-sm flex-1" aria-label="Titel nieuwe les" />
                <SubmitButton className="btn-secondary">Les toevoegen</SubmitButton>
              </form>
            </li>
          );
        })}
      </ol>

      <section className="card p-6">
        <h2 className="text-2xl">Nieuwe module</h2>
        <form action={createModule} className="mt-3 space-y-3">
          <input name="title" required placeholder="Titel" className="input" aria-label="Titel" />
          <textarea name="description" rows={2} placeholder="Korte omschrijving" className="input" aria-label="Omschrijving" />
          <SubmitButton>Module toevoegen</SubmitButton>
        </form>
      </section>
    </div>
  );
}
