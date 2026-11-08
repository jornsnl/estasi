import { Badge } from "@/components/Badge";
import type { Block, LessonDraft } from "@/lib/data";
import { isAnswerable } from "@/lib/domain/progress";
import { isContentBlock } from "@/lib/domain/blocks";
import { ContentBlock } from "./ContentBlock";

const KIND_LABEL = { open: "Open vraag", reflection: "Reflectie", practice: "Praktijkopdracht" } as const;

/**
 * A lesson as a student will see it, for the owner's "Voorbeeld als cursist".
 * Content blocks use the same components as the lesson page; questions are
 * shown with disabled fields, because nothing can be answered here.
 * A block type with its own student view (for example an assignment) adds a
 * preview to PREVIEWS; otherwise a short placeholder is shown.
 */
const PREVIEWS: Partial<Record<Block["type"], (block: Block) => React.ReactNode>> = {
  question: (block) =>
    block.type === "question" && (
      <Shell label={KIND_LABEL[block.kind]} prompt={block.prompt} help={block.helpText} required={block.required} feedback={block.feedback}>
        <textarea rows={5} disabled className="input min-h-32" placeholder="Hier typt de cursist het antwoord…" />
      </Shell>
    ),
  choice: (block) =>
    block.type === "choice" && (
      <Shell label="Meerkeuze" prompt={block.prompt} help={block.helpText} required={block.required} feedback={block.feedback}>
        <div className="space-y-2">
          {block.options.map((option, i) => (
            <label key={`${i}-${option}`} className="flex items-center gap-3 rounded-md border border-line px-4 py-3">
              <input type="radio" disabled /> <span>{option}</span>
            </label>
          ))}
        </div>
      </Shell>
    ),
  upload: (block) =>
    block.type === "upload" && (
      <Shell label="Inleveren" prompt={block.prompt} help={block.helpText} required={block.required} feedback={block.feedback}>
        <input type="file" disabled className="block w-full text-sm" />
      </Shell>
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
      <span className="eyebrow">{isAnswerable(block) ? "Vraag" : "Opdracht"}</span>
      {title && <h3 className="mt-1 font-sans text-lg font-medium">{title}</h3>}
      <p className="mt-2 text-sm text-muted">Hier vult de cursist deze opdracht in.</p>
    </section>
  );
}

function Shell({
  label,
  prompt,
  help,
  required,
  feedback,
  children,
}: {
  label: string;
  prompt: string;
  help: string;
  required: boolean;
  feedback: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="eyebrow">{label}</span>
        <Badge tone={required ? "bordeaux" : "neutral"}>{required ? "Verplicht" : "Optioneel"}</Badge>
        {feedback && <Badge tone="gold">Je ontvangt feedback</Badge>}
      </div>
      <h3 className="font-sans text-lg font-medium">{prompt}</h3>
      {help && <p className="hint mb-3">{help}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
