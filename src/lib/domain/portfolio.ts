import type {
  AssignmentAnswers,
  AssignmentBlock,
  AssignmentFeedback,
  FileRef,
  Lesson,
  Module,
  Submission,
  SubmissionStatus,
  SubmissionVersion,
} from "@/lib/data/types";
import { answersAsText, assignmentsOf, assignmentTitle, filesIn, sameAnswers, STATUS_LABELS } from "./assignment";
import { uniqueNames } from "./privacy";

/**
 * The personal portfolio of a student (Academy 10): every assignment with
 * something in it, per module and lesson, with the questions as they were
 * when it was handed in (the copy in the version), the answers, files,
 * feedback that was sent and every earlier version. Built from the stored
 * data on every view, so it is always complete. Pure, covered by unit tests.
 */

export interface PortfolioVersion {
  id: string;
  version: number;
  submittedAt: string;
  assignment: AssignmentBlock;
  answers: AssignmentAnswers;
  questionForSabine: string;
  feedbackRequested: boolean;
  feedback: AssignmentFeedback[];
}

export interface PortfolioItem {
  submissionId: string;
  lessonId: string;
  blockId: string;
  title: string;
  status: SubmissionStatus;
  graded: boolean;
  /** Oldest first. */
  versions: PortfolioVersion[];
  /** Work not handed in (yet), or changed since the last version. */
  draft: { assignment: AssignmentBlock; answers: AssignmentAnswers; updatedAt: string } | null;
}

export interface PortfolioLesson {
  lessonId: string;
  title: string;
  items: PortfolioItem[];
}

export interface PortfolioModule {
  /** Null: lessons that no longer exist (their work is kept). */
  moduleId: string | null;
  title: string;
  lessons: PortfolioLesson[];
}

export interface PortfolioInput {
  modules: Module[];
  lessons: Lesson[];
  submissions: Submission[];
  versions: SubmissionVersion[];
  /** Feedback on these versions. For a student: only what was sent (see portfolioFeedback). */
  feedback: AssignmentFeedback[];
}

/** A student sees only feedback that was sent; drafts stay with Sabine. */
export const portfolioFeedback = (feedback: AssignmentFeedback[], audience: "student" | "owner") =>
  audience === "owner" ? feedback : feedback.filter((f) => f.sentAt !== null);

const hasContent = (answers: AssignmentAnswers | null | undefined) => !!answers && Object.keys(answers).length > 0;

export function buildPortfolio(input: PortfolioInput): PortfolioModule[] {
  const lessonById = new Map(input.lessons.map((l) => [l.id, l]));
  const moduleById = new Map(input.modules.map((m) => [m.id, m]));
  const versionsBySub = new Map<string, SubmissionVersion[]>();
  for (const v of input.versions) versionsBySub.set(v.submissionId, [...(versionsBySub.get(v.submissionId) ?? []), v]);
  const feedbackByVersion = new Map<string, AssignmentFeedback[]>();
  for (const f of input.feedback) feedbackByVersion.set(f.versionId, [...(feedbackByVersion.get(f.versionId) ?? []), f]);

  const items: PortfolioItem[] = [];
  for (const s of input.submissions) {
    const versions = (versionsBySub.get(s.id) ?? []).slice().sort((a, b) => a.version - b.version);
    const lesson = lessonById.get(s.lessonId);
    const current = lesson ? assignmentsOf(lesson.blocks).find((a) => a.id === s.blockId) : undefined;
    const last = versions.at(-1);
    const draftChanged = hasContent(s.draft) && (!last || !sameAnswers(s.draft, last.answers));
    if (versions.length === 0 && !draftChanged) continue;
    const definition = current ?? last?.assignment;
    if (!definition) continue;
    items.push({
      submissionId: s.id,
      lessonId: s.lessonId,
      blockId: s.blockId,
      title: assignmentTitle(last?.assignment ?? definition),
      status: s.status,
      graded: (last?.assignment ?? definition).graded,
      versions: versions.map((v) => ({
        id: v.id,
        version: v.version,
        submittedAt: v.submittedAt,
        assignment: v.assignment,
        answers: v.answers,
        questionForSabine: v.questionForSabine,
        feedbackRequested: v.feedbackRequested,
        feedback: (feedbackByVersion.get(v.id) ?? []).slice().sort((a, b) => (a.sentAt ?? a.createdAt).localeCompare(b.sentAt ?? b.createdAt)),
      })),
      draft: draftChanged ? { assignment: definition, answers: s.draft, updatedAt: s.updatedAt } : null,
    });
  }

  // Group per lesson, in the order of the blocks in the lesson.
  const byLesson = new Map<string, PortfolioItem[]>();
  for (const item of items) byLesson.set(item.lessonId, [...(byLesson.get(item.lessonId) ?? []), item]);
  const blockOrder = (lessonId: string, blockId: string) => {
    const i = lessonById.get(lessonId)?.blocks.findIndex((b) => b.id === blockId) ?? -1;
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };

  const modules = new Map<string | null, PortfolioModule>();
  const moduleKeys = [...byLesson.keys()].map((lessonId) => {
    const lesson = lessonById.get(lessonId);
    return lesson && moduleById.has(lesson.moduleId) ? lesson.moduleId : null;
  });
  for (const [i, lessonId] of [...byLesson.keys()].entries()) {
    const key = moduleKeys[i];
    const lesson = lessonById.get(lessonId);
    if (!modules.has(key)) {
      modules.set(key, { moduleId: key, title: key ? moduleById.get(key)!.title : "Lessen die niet meer bestaan", lessons: [] });
    }
    const lessonItems = byLesson.get(lessonId)!.sort((a, b) => blockOrder(lessonId, a.blockId) - blockOrder(lessonId, b.blockId));
    modules.get(key)!.lessons.push({ lessonId, title: key && lesson ? lesson.title : "Verwijderde les", items: lessonItems });
  }
  for (const m of modules.values()) {
    m.lessons.sort((a, b) => (lessonById.get(a.lessonId)?.position ?? 1e9) - (lessonById.get(b.lessonId)?.position ?? 1e9));
  }
  return [...modules.values()].sort((a, b) => {
    const pa = a.moduleId ? moduleById.get(a.moduleId)!.position : Number.MAX_SAFE_INTEGER;
    const pb = b.moduleId ? moduleById.get(b.moduleId)!.position : Number.MAX_SAFE_INTEGER;
    return pa - pb;
  });
}

export const portfolioItemCount = (portfolio: PortfolioModule[]) => portfolio.reduce((n, m) => n + m.lessons.reduce((k, l) => k + l.items.length, 0), 0);

export interface PortfolioFile {
  file: FileRef;
  /** Path inside the export zip. */
  path: string;
}

/** Every file in the portfolio once (uploads in every version and draft, feedback attachments), with a unique name. */
export function portfolioFiles(portfolio: PortfolioModule[]): PortfolioFile[] {
  const seen = new Map<string, FileRef>();
  const add = (f: FileRef | null | undefined) => {
    if (f && !seen.has(f.id)) seen.set(f.id, f);
  };
  for (const m of portfolio)
    for (const l of m.lessons)
      for (const item of l.items) {
        for (const v of item.versions) {
          filesIn(v.answers).forEach(add);
          v.feedback.forEach((f) => add(f.attachment));
        }
        if (item.draft) filesIn(item.draft.answers).forEach(add);
      }
  const files = [...seen.values()];
  const names = uniqueNames(files.map((f) => f.name));
  return files.map((file, i) => ({ file, path: `bestanden/${names[i]}` }));
}

// HTML export ---------------------------------------------------------------------

export const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const text = (value: string) => escapeHtml(value).replace(/\n/g, "<br>");

export const EXPORT_STYLE = `
  body { font-family: Inter, Arial, sans-serif; color: #2b2522; background: #F5F0E8; margin: 0; line-height: 1.5; }
  main { max-width: 860px; margin: 0 auto; padding: 32px 20px 64px; }
  h1, h2, h3, h4 { font-family: "Playfair Display", Georgia, serif; color: #6B1E2E; font-weight: 600; }
  h1 { font-size: 32px; margin: 0 0 4px; } h2 { font-size: 24px; margin: 40px 0 8px; border-bottom: 2px solid #A89650; padding-bottom: 4px; }
  h3 { font-size: 19px; margin: 24px 0 8px; } h4 { font-size: 16px; margin: 16px 0 6px; color: #2b2522; }
  .meta { color: #6f655e; font-size: 13px; } .card { background: #fff; border: 1px solid #e6dccb; border-radius: 10px; padding: 16px 18px; margin: 12px 0; }
  .version { border-top: 1px solid #e6dccb; margin-top: 12px; padding-top: 10px; }
  .q { font-weight: 600; margin: 10px 0 2px; } .a { margin: 0 0 6px; } .empty { color: #8b8078; font-style: italic; }
  .feedback { border-left: 3px solid #A89650; background: #faf6ee; padding: 8px 12px; margin: 10px 0; }
  .badge { display: inline-block; font-size: 12px; border: 1px solid #A89650; color: #6b5a1f; border-radius: 99px; padding: 1px 8px; margin-left: 6px; }
  img.preview { max-width: 320px; max-height: 240px; border: 1px solid #e6dccb; border-radius: 6px; margin: 4px 8px 4px 0; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; } td, th { border-bottom: 1px solid #e6dccb; padding: 4px 6px; text-align: left; vertical-align: top; }
  a { color: #6B1E2E; }
  @media print { body { background: #fff; } .card { break-inside: avoid; } }
`;

export interface HtmlOptions {
  studentName: string;
  generatedAt: string;
  /** Formats an ISO date for display (Dutch, Amsterdam time). */
  formatDate: (iso: string) => string;
  /** Link to a file: a path in the zip, or a URL in the app. */
  hrefFor: (file: FileRef) => string;
}

function answersHtml(assignment: AssignmentBlock, answers: AssignmentAnswers, options: HtmlOptions): string {
  const lines = answersAsText(assignment, answers);
  let lastPart = "";
  return lines
    .map((line) => {
      const head = line.part && line.part !== lastPart ? `<h4>${escapeHtml(line.part)}</h4>` : "";
      lastPart = line.part;
      const files = line.files
        .map((f) =>
          f.mime.startsWith("image/")
            ? `<a href="${escapeHtml(options.hrefFor(f))}"><img class="preview" src="${escapeHtml(options.hrefFor(f))}" alt="${escapeHtml(f.name)}"></a>`
            : `<a href="${escapeHtml(options.hrefFor(f))}">${escapeHtml(f.name)}</a>`,
        )
        .join(" ");
      const answer = line.files.length > 0 ? files : line.answer.trim() ? text(line.answer) : `<span class="empty">Niet ingevuld</span>`;
      return `${head}<p class="q">${escapeHtml(line.question || "(vraag zonder tekst)")}</p><p class="a">${answer}</p>`;
    })
    .join("\n");
}

/** A complete, standalone HTML page of the portfolio (export and print). */
export function portfolioHtml(portfolio: PortfolioModule[], options: HtmlOptions): string {
  const body = portfolio
    .map((m) => {
      const lessons = m.lessons
        .map((l) => {
          const items = l.items
            .map((item) => {
              const versions = item.versions
                .map((v) => {
                  const feedback = v.feedback
                    .map(
                      (f) =>
                        `<div class="feedback"><p class="meta">Feedback van Sabine · ${escapeHtml(options.formatDate(f.sentAt ?? f.createdAt))}${f.sentAt ? "" : " · concept, nog niet verstuurd"}</p><p>${text(f.text)}</p>${
                          f.attachment ? `<p><a href="${escapeHtml(options.hrefFor(f.attachment))}">Bijlage: ${escapeHtml(f.attachment.name)}</a></p>` : ""
                        }</div>`,
                    )
                    .join("");
                  const question = v.questionForSabine ? `<p class="meta">Vraag aan Sabine: ${text(v.questionForSabine)}</p>` : "";
                  return `<div class="version"><p class="meta"><strong>Versie ${v.version}</strong> · ingediend ${escapeHtml(options.formatDate(v.submittedAt))}${
                    v.feedbackRequested ? " · feedback gevraagd" : ""
                  }</p>${question}${answersHtml(v.assignment, v.answers, options)}${feedback}</div>`;
                })
                .join("");
              const draft = item.draft
                ? `<div class="version"><p class="meta"><strong>${item.versions.length ? "Aangepast, nog niet opnieuw ingediend" : "Concept, nog niet ingediend"}</strong> · opgeslagen ${escapeHtml(
                    options.formatDate(item.draft.updatedAt),
                  )}</p>${answersHtml(item.draft.assignment, item.draft.answers, options)}</div>`
                : "";
              const intro = (item.versions.at(-1)?.assignment ?? item.draft?.assignment)?.intro;
              return `<div class="card"><h4>${escapeHtml(item.title)}<span class="badge">${escapeHtml(STATUS_LABELS[item.status])}</span>${
                item.graded ? '<span class="badge">Eindopdracht</span>' : ""
              }</h4>${intro ? `<p class="meta">${text(intro)}</p>` : ""}${versions}${draft}</div>`;
            })
            .join("\n");
          return `<h3>${escapeHtml(l.title)}</h3>\n${items}`;
        })
        .join("\n");
      return `<h2>${escapeHtml(m.title)}</h2>\n${lessons}`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Portfolio ${escapeHtml(options.studentName)} · Future Weddings Academy</title><style>${EXPORT_STYLE}</style></head>
<body><main>
<p class="meta">Future Weddings Academy · Estasi Weddings</p>
<h1>Portfolio van ${escapeHtml(options.studentName)}</h1>
<p class="meta">Gemaakt op ${escapeHtml(options.formatDate(options.generatedAt))}. Alle opdrachten met je antwoorden, bestanden, feedback en eerdere versies. De bestanden staan in de map "bestanden" naast dit document.</p>
${body || '<p class="empty">Er staan nog geen opdrachten in het portfolio.</p>'}
</main></body></html>`;
}
