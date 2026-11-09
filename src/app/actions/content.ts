"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/academy";
import { requireOwner } from "@/lib/auth/session";
import { getStore, type Block, type ContentStatus, type Lesson } from "@/lib/data";
import { emptyBlock } from "@/lib/domain/blocks";
import { LIMITS, normaliseUrl } from "@/lib/domain/input";
import { applyEdit, copyLesson as copyOf, discardDraft, editableContent, orderBlocks, publishLesson, unpublishLesson } from "@/lib/domain/publishing";
import { isPublished, parseModulePackages } from "@/lib/domain/visibility";
import { readBlock } from "@/lib/lesson-blocks";
import { storeImageUpload, UploadError } from "@/lib/uploads";
import { newId } from "@/lib/util/id";

const str = (formData: FormData, name: string, max = 500) => String(formData.get(name) ?? "").trim().slice(0, max);
const statusOf = (formData: FormData): ContentStatus => (str(formData, "status") === "published" ? "published" : "draft");

function done(path: string, message: string, isError = false): never {
  const [base, anchor = ""] = path.split("#");
  redirect(`${base}${base.includes("?") ? "&" : "?"}${isError ? "fout" : "melding"}=${encodeURIComponent(message)}${anchor ? `#${anchor}` : ""}`);
}

/** Swaps an item with its neighbour and rewrites positions 1..n. */
function reorder<T extends { id: string; position: number }>(items: T[], id: string, direction: string): T[] {
  const list = [...items].sort((a, b) => a.position - b.position);
  const i = list.findIndex((x) => x.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i !== -1 && j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
  return list.map((x, index) => ({ ...x, position: index + 1 }));
}

// Modules

export async function createModule(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const title = str(formData, "title", LIMITS.moduleTitle);
  if (!title) done("/beheer/inhoud", "Geef de module een titel.", true);
  const modules = await store.listModules();
  const created = await store.saveModule({
    id: newId(),
    title,
    description: str(formData, "description", LIMITS.moduleDescription),
    position: modules.length + 1,
    packages: parseModulePackages(str(formData, "packages")),
    status: statusOf(formData),
  });
  await audit(owner, "Module toegevoegd", `${title} (${created.status === "published" ? "gepubliceerd" : "concept"}, pakket ${created.packages})`);
  done(`/beheer/inhoud#${created.id}`, created.status === "published" ? "Module toegevoegd en gepubliceerd." : "Module toegevoegd als concept.");
}

export async function updateModule(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const existing = await store.getModule(str(formData, "id"));
  if (!existing) done("/beheer/inhoud", "Module niet gevonden.", true);
  const packages = parseModulePackages(str(formData, "packages"));
  // Feedback: a photo per module for its tile, like the photo of a recommendation.
  let imageFileId = formData.get("removeImage") === "on" ? null : existing.imageFileId ?? null;
  try {
    const image = await storeImageUpload(formData.get("image"), owner.id);
    if (image) imageFileId = image.id;
  } catch (err) {
    if (err instanceof UploadError) done(`/beheer/inhoud#${existing.id}`, err.message, true);
    throw err;
  }
  await store.saveModule({
    ...existing,
    title: str(formData, "title", LIMITS.moduleTitle) || existing.title,
    description: str(formData, "description", LIMITS.moduleDescription),
    packages,
    imageFileId,
  });
  if ((existing.packages ?? "AB") !== packages) await audit(owner, "Pakket van module gewijzigd", `${existing.title}: ${packages}`);
  done(`/beheer/inhoud#${existing.id}`, "Module opgeslagen.");
}

/** Publish a module, or put it back to concept (hidden for students). */
export async function setModuleStatus(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const existing = await store.getModule(str(formData, "id"));
  if (!existing) done("/beheer/inhoud", "Module niet gevonden.", true);
  const status = statusOf(formData);
  await store.saveModule({ ...existing, status });
  await audit(owner, status === "published" ? "Module gepubliceerd" : "Module teruggezet naar concept", existing.title);
  done(
    `/beheer/inhoud#${existing.id}`,
    status === "published" ? `Module "${existing.title}" is gepubliceerd.` : `Module "${existing.title}" is weer een concept en niet meer zichtbaar voor cursisten.`,
  );
}

export async function moveModule(formData: FormData) {
  await requireOwner();
  const store = getStore();
  for (const m of reorder(await store.listModules(), str(formData, "id"), str(formData, "direction"))) {
    await store.saveModule(m);
  }
  redirect("/beheer/inhoud");
}

export async function deleteModule(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const existing = await store.getModule(str(formData, "id"));
  if (!existing) redirect("/beheer/inhoud");
  await store.deleteModule(existing.id);
  for (const m of reorder(await store.listModules(), "", "")) await store.saveModule(m);
  await audit(owner, "Module verwijderd", existing.title);
  done("/beheer/inhoud", `Module "${existing.title}" verwijderd.`);
}

// Lessons

export async function createLesson(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const moduleId = str(formData, "moduleId");
  const title = str(formData, "title", LIMITS.lessonTitle);
  if (!title) done("/beheer/inhoud", "Geef de les een titel.", true);
  if (!(await store.getModule(moduleId))) done("/beheer/inhoud", "Module niet gevonden.", true);
  const lessons = await store.listLessons(moduleId);
  const lesson = await store.saveLesson({
    id: newId(),
    moduleId,
    title,
    summary: "",
    position: lessons.length + 1,
    blocks: [],
    // New lessons start as a concept: students see them once they are published.
    status: "draft",
    draft: null,
    publishedAt: null,
  });
  await audit(owner, "Les toegevoegd", title);
  done(`/beheer/inhoud/les/${lesson.id}`, "Les aangemaakt als concept. Voeg nu blokken toe.");
}

export async function moveLesson(formData: FormData) {
  await requireOwner();
  const store = getStore();
  const lesson = await store.getLesson(str(formData, "id"));
  if (!lesson) redirect("/beheer/inhoud");
  for (const l of reorder(await store.listLessons(lesson.moduleId), lesson.id, str(formData, "direction"))) {
    await store.saveLesson(l);
  }
  redirect(`/beheer/inhoud#${lesson.moduleId}`);
}

export async function deleteLesson(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const lesson = await store.getLesson(str(formData, "id"));
  if (!lesson) redirect("/beheer/inhoud");
  await store.deleteLesson(lesson.id);
  for (const l of reorder(await store.listLessons(lesson.moduleId), "", "")) await store.saveLesson(l);
  await audit(owner, "Les verwijderd", lesson.title);
  done(`/beheer/inhoud#${lesson.moduleId}`, `Les "${lesson.title}" verwijderd.`);
}

/**
 * Copies a lesson (as it is in the editor) into the same or another module,
 * as a new concept. Only the definition: answers, submissions and feedback
 * belong to the original's blocks and never come along.
 */
export async function copyLesson(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const lesson = await store.getLesson(str(formData, "id"));
  if (!lesson) done("/beheer/inhoud", "Les niet gevonden.", true);
  const target = (await store.getModule(str(formData, "moduleId"))) ?? (await store.getModule(lesson.moduleId));
  if (!target) done("/beheer/inhoud", "Module niet gevonden.", true);
  const position = (await store.listLessons(target.id)).length + 1;
  const copy = await store.saveLesson(copyOf(lesson, { id: newId(), moduleId: target.id, position }, newId));
  await audit(owner, "Les gekopieerd", `${lesson.title} → ${target.title}`);
  done(`/beheer/inhoud/les/${copy.id}`, `Kopie gemaakt in "${target.title}". De kopie is een concept.`);
}

/** Moves a lesson to the end of another module. */
async function moveToModule(lesson: Lesson, moduleId: string): Promise<Lesson> {
  const store = getStore();
  if (moduleId === lesson.moduleId || !(await store.getModule(moduleId))) return lesson;
  const moved = await store.saveLesson({ ...lesson, moduleId, position: (await store.listLessons(moduleId)).length + 1 });
  // Close the gap the lesson left in its old module.
  for (const l of reorder(await store.listLessons(lesson.moduleId), "", "")) await store.saveLesson(l);
  return moved;
}

export async function moveLessonToModule(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const lesson = await store.getLesson(str(formData, "id"));
  if (!lesson) done("/beheer/inhoud", "Les niet gevonden.", true);
  const moved = await moveToModule(lesson, str(formData, "moduleId"));
  if (moved.moduleId !== lesson.moduleId) await audit(owner, "Les verplaatst", lesson.title);
  done(`/beheer/inhoud#${moved.moduleId}`, moved.moduleId !== lesson.moduleId ? `Les "${lesson.title}" verplaatst.` : "De les staat al in deze module.");
}

// Lesson editor

/** Upload of a picture inside lesson text (from the text editor). Only image types. */
export async function uploadLessonImage(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const owner = await requireOwner();
  try {
    const file = await storeImageUpload(formData.get("file"), owner.id);
    if (!file) return { ok: false, error: "Kies een afbeelding." };
    return { ok: true, url: `/api/bestanden/${file.id}` };
  } catch (err) {
    if (err instanceof UploadError) return { ok: false, error: err.message };
    throw err;
  }
}

/**
 * The whole lesson editor is one form. Every button submits all fields, so
 * saving, adding or deleting a block never throws away edits made elsewhere
 * on the page. The pressed button says what else to do ("intent").
 * A lesson in concept is changed directly. In a published lesson the edits go
 * into its draft; students keep seeing the live version until "Publiceren".
 */
export async function saveLessonEditor(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  let lesson = await store.getLesson(str(formData, "lessonId"));
  if (!lesson) redirect("/beheer/inhoud");
  const path = `/beheer/inhoud/les/${lesson.id}`;
  const [action, arg = "", extra = ""] = str(formData, "intent").split(":");

  if (action === "discard") {
    await store.saveLesson(discardDraft(lesson));
    await audit(owner, "Conceptwijzigingen weggegooid", lesson.title);
    done(path, "De wijzigingen zijn weggegooid. De les is weer zoals cursisten hem zien.");
  }

  // 1. Everything typed on the page, in the order of the editor. Blocks without fields in the form stay as they are.
  const content = editableContent(lesson);
  const uploadErrors: string[] = [];
  let blocks: Block[] = [];
  for (const b of content.blocks) blocks.push(await readBlock(b, formData, owner.id, uploadErrors));
  blocks = orderBlocks(blocks, str(formData, "blockOrder", 20_000).split(",").filter(Boolean));

  // 2. What the pressed button asks for.
  let message = isPublished(lesson) ? "Wijzigingen opgeslagen als concept. Cursisten zien ze pas na publiceren." : "Les opgeslagen.";
  let anchor = "";
  if (action === "add") {
    const block = emptyBlock(arg, extra, newId());
    if (block) {
      blocks.push(block);
      message = "Opgeslagen en blok toegevoegd.";
      anchor = `#blok-${block.id}`;
    }
  } else if (action === "delete") {
    blocks = blocks.filter((b) => b.id !== arg);
    message = "Opgeslagen en blok verwijderd. Eerder gegeven antwoorden blijven bewaard.";
  }

  lesson = applyEdit(lesson, {
    title: str(formData, "title", LIMITS.lessonTitle) || content.title,
    summary: formData.has("summary") ? str(formData, "summary", LIMITS.lessonSummary) : content.summary,
    blocks,
  });
  if (action === "publish") {
    lesson = publishLesson(lesson);
    message = "De les is gepubliceerd en zichtbaar voor cursisten (als de module ook gepubliceerd is).";
  } else if (action === "unpublish") {
    lesson = unpublishLesson(lesson);
    message = "De les is weer een concept en niet meer zichtbaar voor cursisten.";
  }
  await store.saveLesson(lesson);
  if (action === "publish") await audit(owner, "Les gepubliceerd", lesson.title);
  if (action === "unpublish") await audit(owner, "Les teruggezet naar concept", lesson.title);
  // Moving to another module is part of the structure, not of the content: it applies straight away.
  lesson = await moveToModule(lesson, str(formData, "moduleId"));

  if (uploadErrors.length > 0) {
    const error = `Je wijzigingen zijn opgeslagen, maar een bestand is niet geüpload: ${uploadErrors.join(" ")}`;
    redirect(`${path}?fout=${encodeURIComponent(error)}${anchor}`);
  }
  if (action === "preview") redirect(`${path}/voorbeeld`);
  redirect(`${path}?melding=${encodeURIComponent(message)}${anchor}`);
}

// Settings

export async function saveSettings(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const before = await store.getSettings();
  const practicalSpotsAvailable = formData.get("practicalSpotsAvailable") === "on";
  let headerImageFileId = formData.get("removeHeaderImage") === "on" ? null : before.headerImageFileId ?? null;
  try {
    const image = await storeImageUpload(formData.get("headerImage"), owner.id);
    if (image) headerImageFileId = image.id;
  } catch (err) {
    if (err instanceof UploadError) done("/beheer/instellingen", err.message, true);
    throw err;
  }
  await store.saveSettings({
    welcomeVideoUrl: normaliseUrl(str(formData, "welcomeVideoUrl", LIMITS.url)),
    welcomeTitle: str(formData, "welcomeTitle", 120),
    welcomeText: str(formData, "welcomeText", LIMITS.welcomeText),
    headerImageFileId,
    contactEmail: str(formData, "contactEmail", LIMITS.contactEmail) || before.contactEmail,
    practicalSpotsAvailable,
    practicalSpotsNote: str(formData, "practicalSpotsNote", LIMITS.practicalSpotsNote),
    answersPrivacyNotice: str(formData, "answersPrivacyNotice", LIMITS.privacyNotice) || before.answersPrivacyNotice,
    privacyText: str(formData, "privacyText", LIMITS.privacyText),
  });
  if (before.practicalSpotsAvailable !== practicalSpotsAvailable) {
    await audit(owner, practicalSpotsAvailable ? "Praktijkplekken opengezet" : "Praktijkplekken gesloten");
  }
  done("/beheer/instellingen", "Instellingen opgeslagen.");
}
