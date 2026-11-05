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

/** Reads one block's fields from the lesson editor form (field names start with "b.<blockId>."). */
async function readBlock(current: Block, formData: FormData, ownerId: string): Promise<Block> {
  const f = (name: string, max = 500) => str(formData, `b.${current.id}.${name}`, max);
  const checked = (name: string) => formData.get(`b.${current.id}.${name}`) === "on";
  switch (current.type) {
    case "video":
      return { ...current, url: f("url", 1000), caption: f("caption", 300) };
    case "text":
      return { ...current, markdown: f("markdown", 50_000) };
    case "download": {
      const file = await storeUpload(formData.get(`b.${current.id}.file`), { belongsTo: null, uploadedBy: ownerId });
      return {
        ...current,
        label: f("label", 200),
        description: f("description", 500),
        url: f("url", 1000),
        file: checked("removeFile") ? null : (file ?? current.file),
      };
    }
    case "question": {
      const kind = f("kind");
      return {
        ...current,
        kind: (["open", "reflection", "practice"].includes(kind) ? kind : "open") as QuestionKind,
        prompt: f("prompt", 2000),
        helpText: f("helpText", 1000),
        required: checked("required"),
        feedback: checked("feedback"),
      };
    }
    case "choice":
      return {
        ...current,
        prompt: f("prompt", 2000),
        helpText: f("helpText", 1000),
        options: f("options", 5000)
          .split("\n")
          .map((o) => o.trim())
          .filter(Boolean),
        required: checked("required"),
        feedback: checked("feedback"),
      };
    case "upload":
      return { ...current, prompt: f("prompt", 2000), helpText: f("helpText", 1000), required: checked("required"), feedback: checked("feedback") };
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
  const lesson = await store.getLesson(str(formData, "id"));
  if (!lesson) redirect("/beheer/inhoud");
  const path = `/beheer/inhoud/les/${lesson.id}`;

  // 1. Everything typed on the page. Blocks without fields in the form are left as they are.
  let blocks: Block[];
  try {
    blocks = await Promise.all(
      lesson.blocks.map((b) => (formData.has(`b.${b.id}.present`) ? readBlock(b, formData, owner.id) : b)),
    );
  } catch (err) {
    if (err instanceof UploadError) done(path, `${err.message} Je wijzigingen zijn niet opgeslagen.`, true);
    throw err;
  }
  const moduleId = str(formData, "moduleId") || lesson.moduleId;
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
    title: str(formData, "title", 200) || lesson.title,
    summary: str(formData, "summary", 500),
    moduleId,
    position: moved ? (await store.listLessons(moduleId)).length + 1 : lesson.position,
    blocks,
  });
  redirect(`${path}?melding=${encodeURIComponent(message)}${anchor}`);
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
