import type { Block, Lesson, LessonDraft } from "@/lib/data/types";
import { isPublished } from "./visibility";

/**
 * Concept and publishing of a lesson.
 * - A lesson in concept (status draft) is edited directly; students never see it.
 * - A published lesson keeps what students see in title/summary/blocks. Edits
 *   go into `draft` and only replace the live version on "Publiceren".
 *   "Wijzigingen weggooien" drops the draft again.
 * Block ids stay the same when a draft is published, so answers keep their block.
 */

/** What the editor shows: the pending draft, otherwise the lesson itself. */
export function editableContent(lesson: Lesson): LessonDraft {
  if (isPublished(lesson) && lesson.draft) return lesson.draft;
  return { title: lesson.title, summary: lesson.summary, blocks: lesson.blocks };
}

export const hasPendingChanges = (lesson: Lesson) => isPublished(lesson) && !!lesson.draft;

const sameContent = (a: LessonDraft, b: LessonDraft) =>
  a.title === b.title && a.summary === b.summary && JSON.stringify(a.blocks) === JSON.stringify(b.blocks);

/** Saves edited content: as the draft of a published lesson, or straight into a lesson in concept. */
export function applyEdit(lesson: Lesson, content: LessonDraft): Lesson {
  if (!isPublished(lesson)) return { ...lesson, ...content, draft: null };
  const live = { title: lesson.title, summary: lesson.summary, blocks: lesson.blocks };
  // Back to exactly what is live: nothing pending any more.
  return { ...lesson, draft: sameContent(live, content) ? null : content };
}

/** Puts the lesson live: the draft (if any) becomes what students see. */
export function publishLesson(lesson: Lesson, now = new Date()): Lesson {
  const content = editableContent(lesson);
  return { ...lesson, ...content, status: "published", draft: null, publishedAt: now.toISOString() };
}

/** Drops unpublished changes; the live version stays as it was. */
export function discardDraft(lesson: Lesson): Lesson {
  return { ...lesson, draft: null };
}

/** Takes a lesson offline again. Pending changes are kept, as the content of the concept. */
export function unpublishLesson(lesson: Lesson): Lesson {
  const content = editableContent(lesson);
  return { ...lesson, ...content, status: "draft", draft: null };
}

/**
 * A copy of a lesson as a new concept: the definition of every block
 * (texts, videos, downloads, questions and assignments), with new block ids
 * so no answer of the original is ever attached to the copy.
 */
export function copyLesson(
  lesson: Lesson,
  target: { id: string; moduleId: string; position: number },
  newId: () => string,
): Lesson {
  const content = editableContent(lesson);
  const blocks: Block[] = content.blocks.map((b) => ({ ...structuredClone(b), id: newId() }));
  return {
    id: target.id,
    moduleId: target.moduleId,
    position: target.position,
    title: `${content.title} (kopie)`,
    summary: content.summary,
    blocks,
    status: "draft",
    draft: null,
    publishedAt: null,
  };
}

/** Reorders blocks by a list of ids (from the editor); ids that are missing keep their place at the end. */
export function orderBlocks<T extends { id: string }>(blocks: T[], order: string[]): T[] {
  if (order.length === 0) return blocks;
  const rank = new Map(order.map((id, i) => [id, i]));
  return blocks
    .map((b, i) => ({ b, i, r: rank.get(b.id) ?? order.length + i }))
    .sort((x, y) => x.r - y.r)
    .map((x) => x.b);
}
