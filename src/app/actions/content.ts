"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/academy";
import { requireOwner } from "@/lib/auth/session";
import { getStore, type Block, type BlockType, type QuestionKind } from "@/lib/data";
import { LIMITS, normaliseUrl } from "@/lib/domain/input";
import { storeUpload, UploadError } from "@/lib/uploads";
import { newId } from "@/lib/util/id";

const str = (formData: FormData, name: string, max = 500) => String(formData.get(name) ?? "").trim().slice(0, max);
/** Markdown keeps its leading spaces (indented lists); only trailing blank lines go. */
const text = (formData: FormData, name: string, max: number) => String(formData.get(name) ?? "").replace(/\s+$/, "").slice(0, max);

function done(path: string, message: string, isError = false): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${isError ? "fout" : "melding"}=${encodeURIComponent(message)}`);
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
  await store.saveModule({
    id: newId(),
    title,
    description: str(formData, "description", LIMITS.moduleDescription),
    position: modules.length + 1,
  });
  await audit(owner, "Module toegevoegd", title);
  done("/beheer/inhoud", "Module toegevoegd.");
}

export async function updateModule(formData: FormData) {
  await requireOwner();
  const store = getStore();
  const existing = await store.getModule(str(formData, "id"));
  if (!existing) done("/beheer/inhoud", "Module niet gevonden.", true);
  await store.saveModule({
    ...existing,
    title: str(formData, "title", LIMITS.moduleTitle) || existing.title,
    description: str(formData, "description", LIMITS.moduleDescription),
  });
  done(`/beheer/inhoud#${existing.id}`, "Module opgeslagen.");
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
  const lessons = await store.listLessons(moduleId);
  const lesson = await store.saveLesson({
    id: newId(),
    moduleId,
    title,
    summary: "",
    position: lessons.length + 1,
    blocks: [],
  });
  await audit(owner, "Les toegevoegd", title);
  done(`/beheer/inhoud/les/${lesson.id}`, "Les aangemaakt. Voeg nu blokken toe.");
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
  done("/beheer/inhoud", `Les "${lesson.title}" verwijderd.`);
}

// Blocks

function emptyBlock(type: BlockType): Block {
  const id = newId();
  switch (type) {
    case "video":
      return { id, type, url: "", caption: "" };
    case "text":
      return { id, type, markdown: "" };
    case "download":
      return { id, type, label: "", description: "", url: "", file: null };
    case "choice":
      return { id, type, prompt: "", helpText: "", options: ["", ""], required: true, feedback: false };
    case "upload":
      return { id, type, prompt: "", helpText: "", required: false, feedback: true };
    case "question":
    default:
      return { id, type: "question", kind: "open", prompt: "", helpText: "", required: true, feedback: false };
  }
}

const BLOCK_TYPES: BlockType[] = ["video", "text", "download", "question", "choice", "upload"];

/**
 * Reads one block's fields from the lesson editor form (field names start
 * with "b.<blockId>."). A rejected upload does not stop the rest: the block
 * keeps its current file and the problem is reported in uploadErrors.
 */
async function readBlock(current: Block, formData: FormData, ownerId: string, uploadErrors: string[]): Promise<Block> {
  const f = (name: string, max: number) => str(formData, `b.${current.id}.${name}`, max);
  const checked = (name: string) => formData.get(`b.${current.id}.${name}`) === "on";
  switch (current.type) {
    case "video":
      return { ...current, url: normaliseUrl(f("url", LIMITS.url)), caption: f("caption", LIMITS.caption) };
    case "text":
      return { ...current, markdown: text(formData, `b.${current.id}.markdown`, LIMITS.markdown) };
    case "download": {
      let file = null;
      try {
        file = await storeUpload(formData.get(`b.${current.id}.file`), { belongsTo: null, uploadedBy: ownerId });
      } catch (err) {
        if (!(err instanceof UploadError)) throw err;
        uploadErrors.push(err.message);
      }
      return {
        ...current,
        label: f("label", LIMITS.downloadLabel),
        description: f("description", LIMITS.downloadDescription),
        url: normaliseUrl(f("url", LIMITS.url)),
        file: file ?? (checked("removeFile") ? null : current.file),
      };
    }
    case "question": {
      const kind = f("kind", 20);
      return {
        ...current,
        kind: (["open", "reflection", "practice"].includes(kind) ? kind : "open") as QuestionKind,
        prompt: f("prompt", LIMITS.prompt),
        helpText: f("helpText", LIMITS.helpText),
        required: checked("required"),
        feedback: checked("feedback"),
      };
    }
    case "choice":
      return {
        ...current,
        prompt: f("prompt", LIMITS.prompt),
        helpText: f("helpText", LIMITS.helpText),
        options: f("options", LIMITS.options)
          .split("\n")
          .map((o) => o.trim())
          .filter(Boolean),
        required: checked("required"),
        feedback: checked("feedback"),
      };
    case "upload":
      return {
        ...current,
        prompt: f("prompt", LIMITS.prompt),
        helpText: f("helpText", LIMITS.helpText),
        required: checked("required"),
        feedback: checked("feedback"),
      };
  }
}

/**
 * The whole lesson editor is one form. Every button submits all fields, so
 * saving, adding, moving or deleting a block never throws away edits made
 * elsewhere on the page. The pressed button says what else to do ("intent").
 */
export async function saveLessonEditor(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const lesson = await store.getLesson(str(formData, "lessonId"));
  if (!lesson) redirect("/beheer/inhoud");
  const path = `/beheer/inhoud/les/${lesson.id}`;

  // 1. Everything typed on the page. Blocks without fields in the form are left as they are.
  const uploadErrors: string[] = [];
  let blocks: Block[] = [];
  for (const b of lesson.blocks) {
    blocks.push(formData.has(`b.${b.id}.present`) ? await readBlock(b, formData, owner.id, uploadErrors) : b);
  }
  const requestedModule = str(formData, "moduleId");
  const moduleId = requestedModule && (await store.getModule(requestedModule)) ? requestedModule : lesson.moduleId;
  const moved = moduleId !== lesson.moduleId;

  // 2. What the pressed button asks for.
  const [action, arg, extra] = str(formData, "intent").split(":");
  let message = "Les opgeslagen.";
  let anchor = "";
  if (action === "add" && BLOCK_TYPES.includes(arg as BlockType)) {
    const block = emptyBlock(arg as BlockType);
    if (block.type === "question" && ["open", "reflection", "practice"].includes(extra)) block.kind = extra as QuestionKind;
    blocks.push(block);
    message = "Les opgeslagen en blok toegevoegd.";
    anchor = `#blok-${block.id}`;
  } else if (action === "move") {
    const i = blocks.findIndex((b) => b.id === arg);
    const j = extra === "up" ? i - 1 : i + 1;
    if (i !== -1 && j >= 0 && j < blocks.length) [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    message = "Les opgeslagen en blok verplaatst.";
    anchor = `#blok-${arg}`;
  } else if (action === "delete") {
    blocks = blocks.filter((b) => b.id !== arg);
    message = "Les opgeslagen en blok verwijderd. Eerder gegeven antwoorden blijven bewaard.";
  }

  await store.saveLesson({
    ...lesson,
    title: str(formData, "title", LIMITS.lessonTitle) || lesson.title,
    summary: str(formData, "summary", LIMITS.lessonSummary),
    moduleId,
    position: moved ? (await store.listLessons(moduleId)).length + 1 : lesson.position,
    blocks,
  });
  // Close the gap the lesson left in its old module.
  if (moved) for (const l of reorder(await store.listLessons(lesson.moduleId), "", "")) await store.saveLesson(l);

  if (uploadErrors.length > 0) {
    const error = `Je wijzigingen zijn opgeslagen, maar een bestand is niet geüpload: ${uploadErrors.join(" ")}`;
    redirect(`${path}?fout=${encodeURIComponent(error)}${anchor}`);
  }
  redirect(`${path}?melding=${encodeURIComponent(message)}${anchor}`);
}

// Settings

export async function saveSettings(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const before = await store.getSettings();
  const practicalSpotsAvailable = formData.get("practicalSpotsAvailable") === "on";
  await store.saveSettings({
    welcomeVideoUrl: normaliseUrl(str(formData, "welcomeVideoUrl", LIMITS.url)),
    welcomeText: str(formData, "welcomeText", LIMITS.welcomeText),
    contactEmail: str(formData, "contactEmail", LIMITS.contactEmail) || before.contactEmail,
    practicalSpotsAvailable,
    practicalSpotsNote: str(formData, "practicalSpotsNote", LIMITS.practicalSpotsNote),
    answersPrivacyNotice: str(formData, "answersPrivacyNotice", LIMITS.privacyNotice) || before.answersPrivacyNotice,
  });
  if (before.practicalSpotsAvailable !== practicalSpotsAvailable) {
    await audit(owner, practicalSpotsAvailable ? "Praktijkplekken opengezet" : "Praktijkplekken gesloten");
  }
  done("/beheer/instellingen", "Instellingen opgeslagen.");
}
