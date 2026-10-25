import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { saveLesson } from "@/app/actions/lesson";
import { AccessNotice } from "@/components/AccessNotice";
import { Badge } from "@/components/Badge";
import { DirtyGuard } from "@/components/DirtyGuard";
import { FeedbackList } from "@/components/FeedbackList";
import { Markdown } from "@/components/Markdown";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { VideoEmbed } from "@/components/VideoEmbed";
import { requireStudent } from "@/lib/auth/session";
import { getStore, type Answer, type Block, type Feedback } from "@/lib/data";
import { hasLessonAccess } from "@/lib/domain/access";
import { canOpenLesson, isAnswerable, moduleProgress } from "@/lib/domain/progress";
import { ACCEPT_ATTR } from "@/lib/uploads";
import { formatBytes, formatDateTime } from "@/lib/util/format";

const KIND_LABEL = { open: "Open vraag", reflection: "Reflectie", practice: "Praktijkopdracht" } as const;

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireStudent();
  const { lessonId } = await params;
  const store = getStore();
  const [lesson, enrollment, modules, lessons, completions, settings] = await Promise.all([
    store.getLesson(lessonId),
    store.getEnrollmentForUser(user.id),
    store.listModules(),
    store.listLessons(),
    store.listCompletions(user.id),
    store.getSettings(),
  ]);
  if (!lesson) notFound();
  if (!hasLessonAccess(enrollment)) {
    return <AccessNotice enrollment={enrollment} contactEmail={settings.contactEmail} />;
  }
  const progress = moduleProgress(modules, lessons, completions);
  if (!canOpenLesson(progress, lesson.id)) redirect("/opleiding");

  const [answers, feedback] = await Promise.all([
    store.listAnswers({ userId: user.id, lessonId }),
    store.listFeedback({ userId: user.id }),
  ]);
  const byBlock = new Map(answers.map((a) => [a.blockId, a]));
  const moduleIndex = modules.findIndex((m) => m.id === lesson.moduleId);
  const currentModule = modules[moduleIndex];

  // Previous/next within the open part of the course.
  const ordered = progress.filter((p) => p.state !== "locked").flatMap((p) => p.lessons);
  const position = ordered.findIndex((l) => l.id === lesson.id);
  const prev = ordered[position - 1];
  const next = ordered[position + 1];
  const completed = completions.some((c) => c.lessonId === lesson.id);
  const hasQuestions = lesson.blocks.some(isAnswerable);

  return (
    <article className="mx-auto max-w-3xl">
      <nav className="mb-6 text-sm text-muted">
        <Link href="/opleiding" className="hover:text-bordeaux">Mijn opleiding</Link>
        <span className="mx-2">/</span>
        <span>Module {moduleIndex + 1}: {currentModule?.title}</span>
      </nav>

      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl sm:text-5xl">{lesson.title}</h1>
          {completed && <Badge tone="success">Afgerond</Badge>}
        </div>
        {lesson.summary && <p className="mt-2 text-lg text-muted">{lesson.summary}</p>}
      </header>

      <form id="lesson-form" action={saveLesson} className="space-y-8">
        <input type="hidden" name="lessonId" value={lesson.id} />
        {lesson.blocks.map((block, i) => {
          const firstQuestion = isAnswerable(block) && !lesson.blocks.slice(0, i).some(isAnswerable);
          return (
            <div key={block.id}>
              {firstQuestion && (
                <div id="opdrachten" className="mb-8 scroll-mt-20 border-t border-line pt-8">
                  <h2 className="text-3xl">Opdrachten</h2>
                  <p className="mt-2 text-sm text-muted">{settings.answersPrivacyNotice}</p>
                  <div className="mt-4">
                    <Notice searchParams={searchParams} />
                  </div>
                </div>
              )}
              <BlockView block={block} answer={byBlock.get(block.id)} feedback={feedback} />
            </div>
          );
        })}

        {hasQuestions ? (
          <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-white/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
            {completed ? (
              <SubmitButton name="intent" value="save" pendingText="Opslaan…">Wijzigingen opslaan</SubmitButton>
            ) : (
              <>
                <SubmitButton name="intent" value="save" className="btn-secondary" pendingText="Opslaan…">Tussentijds opslaan</SubmitButton>
                <SubmitButton name="intent" value="complete" pendingText="Bezig…">Les afronden</SubmitButton>
              </>
            )}
            <DirtyGuard formId="lesson-form" />
          </div>
        ) : (
          <div className="border-t border-line pt-6">
            <Notice searchParams={searchParams} />
            {!completed && (
              <SubmitButton name="intent" value="complete" pendingText="Bezig…">Les afronden</SubmitButton>
            )}
          </div>
        )}
      </form>

      <div className="mt-10 flex justify-between gap-4 border-t border-line pt-6 text-sm">
        {prev ? <Link href={`/les/${prev.id}`} className="btn-ghost">← {prev.title}</Link> : <span />}
        {next ? <Link href={`/les/${next.id}`} className="btn-secondary">{next.title} →</Link> : <span />}
      </div>
    </article>
  );
}

function BlockView({ block, answer, feedback }: { block: Block; answer: Answer | undefined; feedback: Feedback[] }) {
  switch (block.type) {
    case "video":
      return (
        <figure>
          <VideoEmbed url={block.url} title={block.caption || "Lesvideo"} />
          {block.caption && <figcaption className="mt-2 text-sm text-muted">{block.caption}</figcaption>}
        </figure>
      );
    case "text":
      return <Markdown>{block.markdown}</Markdown>;
    case "download": {
      const href = block.file ? `/api/bestanden/${block.file.id}` : block.url;
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="card flex items-center gap-4 p-4 hover:border-gold">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-gold-soft text-gold-ink" aria-hidden>↓</span>
          <span className="flex-1">
            <span className="block font-medium">{block.label || "Download"}</span>
            {block.description && <span className="block text-sm text-muted">{block.description}</span>}
          </span>
          {block.file && <span className="text-sm text-muted">{formatBytes(block.file.size)}</span>}
        </a>
      );
    }
    case "question":
      return (
        <QuestionShell label={KIND_LABEL[block.kind]} prompt={block.prompt} help={block.helpText} required={block.required} answer={answer} feedback={feedback} feedbackBlock={block.feedback}>
          <textarea
            id={`a_${block.id}`}
            name={`a_${block.id}`}
            defaultValue={answer?.text ?? ""}
            rows={6}
            className="input min-h-36 leading-relaxed"
            placeholder="Typ hier je antwoord…"
          />
        </QuestionShell>
      );
    case "choice":
      return (
        <QuestionShell label="Meerkeuze" prompt={block.prompt} help={block.helpText} required={block.required} answer={answer} feedback={feedback} feedbackBlock={block.feedback}>
          <fieldset className="space-y-2">
            <legend className="sr-only">{block.prompt}</legend>
            {block.options.map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-3 rounded-md border border-line px-4 py-3 has-[:checked]:border-gold has-[:checked]:bg-gold-soft/50">
                <input type="radio" name={`c_${block.id}`} value={option} defaultChecked={answer?.choice === option} className="accent-[#722F37]" />
                <span>{option}</span>
              </label>
            ))}
          </fieldset>
        </QuestionShell>
      );
    case "upload":
      return (
        <QuestionShell label="Inleveren" prompt={block.prompt} help={block.helpText} required={block.required} answer={answer} feedback={feedback} feedbackBlock={block.feedback}>
          {answer && answer.files.length > 0 && (
            <ul className="mb-3 space-y-2">
              {answer.files.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-sm">
                  <a href={`/api/bestanden/${f.id}`} className="text-bordeaux underline">{f.name}</a>
                  <label className="flex items-center gap-1.5 text-muted">
                    <input type="checkbox" name={`rm_${block.id}`} value={f.id} /> verwijderen
                  </label>
                </li>
              ))}
            </ul>
          )}
          <input type="file" name={`f_${block.id}`} accept={ACCEPT_ATTR} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-cream file:px-3 file:py-2 file:text-ink" />
        </QuestionShell>
      );
  }
}

function QuestionShell({
  label,
  prompt,
  help,
  required,
  answer,
  feedback,
  feedbackBlock,
  children,
}: {
  label: string;
  prompt: string;
  help: string;
  required: boolean;
  answer: Answer | undefined;
  feedback: Feedback[];
  feedbackBlock: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="eyebrow">{label}</span>
        <Badge tone={required ? "bordeaux" : "neutral"}>{required ? "Verplicht" : "Optioneel"}</Badge>
        {feedbackBlock && <Badge tone="gold">Je ontvangt feedback</Badge>}
      </div>
      <h3 className="font-sans text-lg font-medium">{prompt}</h3>
      {help && <p className="hint mb-3">{help}</p>}
      <div className="mt-3">{children}</div>
      {answer && <p className="mt-2 text-xs text-muted">Laatst opgeslagen: {formatDateTime(answer.updatedAt)}</p>}
      <FeedbackList answer={answer} feedback={feedback} />
    </section>
  );
}
