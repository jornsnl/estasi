"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/academy";
import { requireOwner } from "@/lib/auth/session";
import { getStore, type Block, type BlockType, type QuestionKind } from "@/lib/data";
import { storeUpload, UploadError } from "@/lib/uploads";
import { newId } from "@/lib/util/id";

const str = (formData: FormData, name: string, max = 500) => String(formData.get(name) ?? "").trim().slice(0, max);

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
  const title = str(formData, "title", 200);
  if (!title) done("/beheer/inhoud", "Geef de module een titel.", true);
  const modules = await store.listModules();
  await store.saveModule({
    id: newId(),
    title,
    description: str(formData, "description", 1000),
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
    title: str(formData, "title", 200) || existing.title,
    description: str(formData, "description", 1000),
  });
  done("/beheer/inhoud", "Module opgeslagen.");
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
  const title = str(formData, "title", 200);
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

export async function updateLesson(formData: FormData) {
  await requireOwner();
  const store = getStore();
  const lesson = await store.getLesson(str(formData, "id"));
  if (!lesson) redirect("/beheer/inhoud");
  const moduleId = str(formData, "moduleId") || lesson.moduleId;
  const moved = moduleId !== lesson.moduleId;
  await store.saveLesson({
    ...lesson,
    title: str(formData, "title", 200) || lesson.title,
    summary: str(formData, "summary", 500),
    moduleId,
    position: moved ? (await store.listLessons(moduleId)).length + 1 : lesson.position,
  });
  done(`/beheer/inhoud/les/${lesson.id}`, "Les opgeslagen.");
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

export async function addBlock(formData: FormData) {
  await requireOwner();
  const store = getStore();
  const lesson = await store.getLesson(str(formData, "lessonId"));
  if (!lesson) redirect("/beheer/inhoud");
  const type = str(formData, "type") as BlockType;
  if (!BLOCK_TYPES.includes(type)) done(`/beheer/inhoud/les/${lesson.id}`, "Onbekend bloktype.", true);
  const block = emptyBlock(type);
  if (block.type === "question") block.kind = (str(formData, "kind") as QuestionKind) || "open";
  await store.saveLesson({ ...lesson, blocks: [...lesson.blocks, block] });
  redirect(`/beheer/inhoud/les/${lesson.id}?melding=${encodeURIComponent("Blok toegevoegd.")}#blok-${block.id}`);
}

export async function updateBlock(formData: FormData) {
  await requireOwner();
  const store = getStore();
  const lesson = await store.getLesson(str(formData, "lessonId"));
  if (!lesson) redirect("/beheer/inhoud");
  const path = `/beheer/inhoud/les/${lesson.id}`;
  const blockId = str(formData, "blockId");
  const current = lesson.blocks.find((b) => b.id === blockId);
  if (!current) done(path, "Blok niet gevonden.", true);

  const required = formData.get("required") === "on";
  const feedback = formData.get("feedback") === "on";
  let updated: Block;
  try {
    switch (current.type) {
      case "video":
        updated = { ...current, url: str(formData, "url", 1000), caption: str(formData, "caption", 300) };
        break;
      case "text":
        updated = { ...current, markdown: str(formData, "markdown", 50_000) };
        break;
      case "download": {
        const owner = await requireOwner();
        const file = await storeUpload(formData.get("file"), { belongsTo: null, uploadedBy: owner.id });
        updated = {
          ...current,
          label: str(formData, "label", 200),
          description: str(formData, "description", 500),
          url: str(formData, "url", 1000),
          file: formData.get("removeFile") === "on" ? null : (file ?? current.file),
        };
        break;
      }
      case "question":
        updated = {
          ...current,
          kind: (["open", "reflection", "practice"].includes(str(formData, "kind")) ? str(formData, "kind") : "open") as QuestionKind,
          prompt: str(formData, "prompt", 2000),
          helpText: str(formData, "helpText", 1000),
          required,
          feedback,
        };
        break;
      case "choice":
        updated = {
          ...current,
          prompt: str(formData, "prompt", 2000),
          helpText: str(formData, "helpText", 1000),
          options: str(formData, "options", 5000)
            .split("\n")
            .map((o) => o.trim())
            .filter(Boolean),
          required,
          feedback,
        };
        break;
      case "upload":
        updated = { ...current, prompt: str(formData, "prompt", 2000), helpText: str(formData, "helpText", 1000), required, feedback };
        break;
    }
  } catch (err) {
    if (err instanceof UploadError) done(path, err.message, true);
    throw err;
  }
  await store.saveLesson({ ...lesson, blocks: lesson.blocks.map((b) => (b.id === blockId ? updated : b)) });
  redirect(`${path}?melding=${encodeURIComponent("Blok opgeslagen.")}#blok-${blockId}`);
}

export async function moveBlock(formData: FormData) {
  await requireOwner();
  const store = getStore();
  const lesson = await store.getLesson(str(formData, "lessonId"));
  if (!lesson) redirect("/beheer/inhoud");
  const blockId = str(formData, "blockId");
  const blocks = [...lesson.blocks];
  const i = blocks.findIndex((b) => b.id === blockId);
  const j = str(formData, "direction") === "up" ? i - 1 : i + 1;
  if (i !== -1 && j >= 0 && j < blocks.length) [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  await store.saveLesson({ ...lesson, blocks });
  redirect(`/beheer/inhoud/les/${lesson.id}#blok-${blockId}`);
}

export async function deleteBlock(formData: FormData) {
  await requireOwner();
  const store = getStore();
  const lesson = await store.getLesson(str(formData, "lessonId"));
  if (!lesson) redirect("/beheer/inhoud");
  const blockId = str(formData, "blockId");
  await store.saveLesson({ ...lesson, blocks: lesson.blocks.filter((b) => b.id !== blockId) });
  done(`/beheer/inhoud/les/${lesson.id}`, "Blok verwijderd. Eerder gegeven antwoorden blijven bewaard.");
}

// Settings

export async function saveSettings(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const before = await store.getSettings();
  const practicalSpotsAvailable = formData.get("practicalSpotsAvailable") === "on";
  await store.saveSettings({
    welcomeVideoUrl: str(formData, "welcomeVideoUrl", 1000),
    welcomeText: str(formData, "welcomeText", 2000),
    contactEmail: str(formData, "contactEmail", 200) || before.contactEmail,
    practicalSpotsAvailable,
    practicalSpotsNote: str(formData, "practicalSpotsNote", 1000),
    answersPrivacyNotice: str(formData, "answersPrivacyNotice", 2000) || before.answersPrivacyNotice,
  });
  if (before.practicalSpotsAvailable !== practicalSpotsAvailable) {
    await audit(owner, practicalSpotsAvailable ? "Praktijkplekken opengezet" : "Praktijkplekken gesloten");
  }
  done("/beheer/instellingen", "Instellingen opgeslagen.");
}
