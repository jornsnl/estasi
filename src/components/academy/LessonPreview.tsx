import type { Block, LessonDraft } from "@/lib/data";
import { FEEDBACK_LIMIT } from "@/lib/domain/assignment";
import { isContentBlock } from "@/lib/domain/blocks";
import { AssignmentForm } from "./AssignmentForm";
import { ContentBlock } from "./ContentBlock";

/**
 * A lesson as a student will see it, for the owner's "Voorbeeld als cursist".
 * Content blocks use the same components as the lesson page; questions are
 * shown with disabled fields, because nothing can be answered here.
 * A block type with its own student view (for example an assignment) adds a
 * preview to PREVIEWS; otherwise a short placeholder is shown.
 */
const PREVIEWS: Partial<Record<Block["type"], (block: Block) => React.ReactNode>> = {
  // The student's own form, in preview mode: it can be tried out, nothing is saved or handed in.
  assignment: (block) =>
    block.type === "assignment" && (
      <AssignmentForm lessonId="" assignment={block} initial={null} lastSubmitted={null} versions={[]} feedback={[]} feedbackSlotsLeft={FEEDBACK_LIMIT} firstMeasurement={null} preview />
    ),
};

export function LessonPreview({ content, privacyNotice }: { content: LessonDraft; privacyNotice: string }) {
  const firstAnswerable = content.blocks.findIndex((b) => !isContentBlock(b));
  return (
    <article className="mx-auto max-w-3xl">
      <header className="mb-8">
        <h1 className="text-4xl sm:text-5xl">{content.title}</h1>
        {content.summary && <p className="mt-2 text-lg text-muted">{content.summary}</p>}
      </header>
      <div className="space-y-8">
        {content.blocks.length === 0 && <p className="text-muted">Deze les heeft nog geen blokken.</p>}
        {content.blocks.map((block, i) => (
          <div key={block.id}>
            {i === firstAnswerable && (
              <div className="mb-8 border-t border-line pt-8">
                <h2 className="text-3xl">Opdrachten</h2>
                <p className="mt-2 text-sm text-muted">{privacyNotice}</p>
              </div>
            )}
            {isContentBlock(block) ? (
              <ContentBlock block={block} />
            ) : (
              (PREVIEWS[block.type]?.(block) ?? <Placeholder block={block} />)
            )}
          </div>
        ))}
      </div>
    </article>
  );
}

function Placeholder({ block }: { block: Block }) {
  const title = "title" in block && typeof block.title === "string" ? block.title : "";
  return (
    <section className="card p-5 sm:p-6">
      <span className="eyebrow">Opdracht</span>
      {title && <h3 className="mt-1 font-sans text-lg font-medium">{title}</h3>}
      <p className="mt-2 text-sm text-muted">Hier vult de cursist deze opdracht in.</p>
    </section>
  );
}
