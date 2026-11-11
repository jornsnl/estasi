"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/academy";
import { requireOwner } from "@/lib/auth/session";
import { getStore, type Block, type ContentStatus, type Lesson } from "@/lib/data";
import { emptyBlock } from "@/lib/domain/blocks";
import { LIMITS } from "@/lib/domain/input";
import { applyEdit, copyLesson as copyOf, discardDraft, editableContent, orderBlocks, publishLesson, unpublishLesson } from "@/lib/domain/publishing";
import { isPublished, parseModulePackages } from "@/lib/domain/visibility";
import { readBlock } from "@/lib/lesson-blocks";
import { getBrandLogos, LOGO_KINDS, LOGO_LABELS, saveBrandLogos } from "@/lib/brand-logos";
import { storeBrandLogoUpload, storeImageUpload, storeLogoUpload, UploadError } from "@/lib/uploads";
import { getSignupPage, saveSignupPage, type SignupImageField } from "@/lib/signup-page";
import { newId } from "@/lib/util/id";
import { addPracticalSpot, removePracticalSpot, updatePracticalSpot } from "@/lib/practical-spots";

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
  let headerImageFileId = formData.get("removeHeaderImage") === "on" ? null : before.headerImageFileId ?? null;
  let newHeader = false;
  try {
    const image = await storeImageUpload(formData.get("headerImage"), owner.id);
    if (image) headerImageFileId = image.id;
    newHeader = Boolean(image);
  } catch (err) {
    if (err instanceof UploadError) done("/beheer/instellingen", err.message, true);
    throw err;
  }
  await store.saveSettings({
    // Feedback: the welcome pop-up (video and message) is for couples only, so the Academy no longer
    // asks for one. What was stored stays as it was.
    welcomeVideoUrl: before.welcomeVideoUrl,
    welcomeTitle: before.welcomeTitle,
    welcomeText: before.welcomeText,
    headerImageFileId,
    contactEmail: str(formData, "contactEmail", LIMITS.contactEmail) || before.contactEmail,
    // Feedback Sabine: the practical spots have their own box with their own save (savePracticalSpotsOpenAction),
    // and the note under the tick box is gone. What was stored stays as it was.
    practicalSpotsAvailable: before.practicalSpotsAvailable,
    practicalSpotsNote: before.practicalSpotsNote,
    answersPrivacyNotice: str(formData, "answersPrivacyNotice", LIMITS.privacyNotice) || before.answersPrivacyNotice,
    privacyText: str(formData, "privacyText", LIMITS.privacyText),
  });
  done(
    "/beheer/instellingen",
    newHeader ? "Headerfoto opgeslagen. Hij staat nu bovenaan de hoofdpagina van de Academy." : headerImageFileId === null && before.headerImageFileId ? "Headerfoto weggehaald." : "Instellingen opgeslagen.",
  );
}

/** The tick box "Er zijn praktijkplekken beschikbaar", saved on its own (it sits with the weddings, outside the settings form). */
export async function savePracticalSpotsOpenAction(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const before = await store.getSettings();
  const practicalSpotsAvailable = formData.get("practicalSpotsAvailable") === "on";
  if (before.practicalSpotsAvailable !== practicalSpotsAvailable) {
    await store.saveSettings({ ...before, practicalSpotsAvailable });
    await audit(owner, practicalSpotsAvailable ? "Praktijkplekken opengezet" : "Praktijkplekken gesloten");
  }
  done(SPOTS_PATH, practicalSpotsAvailable ? "Praktijkplekken staan open." : "Praktijkplekken staan dicht.");
}

// Praktijkplekken (feedback Sabine): weddings with a date, the couple's names and a linked student.

const SPOTS_PATH = "/beheer/instellingen#praktijkplekken";

async function spotInput(formData: FormData) {
  const date = str(formData, "weddingDate", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) done(SPOTS_PATH, "Vul de datum van de bruiloft in.", true);
  const names = str(formData, "coupleNames", 200);
  if (!names) done(SPOTS_PATH, "Vul de namen van het bruidspaar in.", true);
  const studentId = str(formData, "studentId", 40);
  let student = null;
  if (studentId) {
    const user = await getStore().getUser(studentId);
    if (!user || user.role !== "student") done(SPOTS_PATH, "Die cursist bestaat niet (meer).", true);
    student = user;
  }
  return { input: { wedding_date: date, couple_names: names, location: str(formData, "location", 200), student_user_id: student?.id ?? null, note: str(formData, "note", 300) }, student };
}

export async function addPracticalSpotAction(formData: FormData) {
  const owner = await requireOwner();
  const { input, student } = await spotInput(formData);
  await addPracticalSpot(input);
  await audit(owner, "Praktijkplek toegevoegd", `${input.couple_names}, ${input.wedding_date}${student ? ` · ${student.name}` : ""}`, student?.id ?? null);
  done(SPOTS_PATH, "Praktijkplek toegevoegd.");
}

export async function updatePracticalSpotAction(formData: FormData) {
  const owner = await requireOwner();
  const { input, student } = await spotInput(formData);
  if (!(await updatePracticalSpot(str(formData, "id", 40), input))) done(SPOTS_PATH, "Die praktijkplek bestaat niet meer.", true);
  await audit(owner, "Praktijkplek aangepast", `${input.couple_names}, ${input.wedding_date}${student ? ` · ${student.name}` : " · geen cursist"}`, student?.id ?? null);
  done(SPOTS_PATH, "Praktijkplek opgeslagen.");
}

export async function removePracticalSpotAction(formData: FormData) {
  const owner = await requireOwner();
  const removed = await removePracticalSpot(str(formData, "id", 40));
  if (removed) await audit(owner, "Praktijkplek verwijderd", `${removed.couple_names}, ${removed.wedding_date}`, removed.student_user_id);
  done(SPOTS_PATH, removed ? "Praktijkplek verwijderd." : "Die praktijkplek bestaat niet meer.");
}

// Inschrijfpagina (feedback Sabine): logo, photo at "Je opleider" and the review with two photos.

export async function saveSignupPageAction(formData: FormData) {
  const owner = await requireOwner();
  const path = "/beheer/instellingen/inschrijfpagina";
  const page = await getSignupPage();
  const images: [SignupImageField, string][] = [
    ["logo_file_id", "logo"],
    ["trainer_photo_file_id", "trainerPhoto"],
    ["review_photo1_file_id", "reviewPhoto1"],
    ["review_photo2_file_id", "reviewPhoto2"],
  ];
  try {
    for (const [field, name] of images) {
      if (formData.get(`remove-${name}`) === "on") page[field] = null;
      const file = field === "logo_file_id" ? await storeLogoUpload(formData.get(name), owner.id) : await storeImageUpload(formData.get(name), owner.id);
      if (file) page[field] = file.id;
    }
  } catch (err) {
    if (err instanceof UploadError) done(path, err.message, true);
    throw err;
  }
  page.review_text = str(formData, "reviewText", 3000);
  page.review_name = str(formData, "reviewName", 120);
  await saveSignupPage(page);
  await audit(owner, "Inschrijfpagina aangepast");
  done(path, "Inschrijfpagina opgeslagen.");
}

/** Instellingen, Logo's (feedback Sabine): the logos in the mails and as app icon. */
export async function saveBrandLogosAction(formData: FormData) {
  const owner = await requireOwner();
  const path = "/beheer/instellingen/logos";
  const logos = await getBrandLogos();
  const changed: string[] = [];
  try {
    for (const kind of LOGO_KINDS) {
      if (formData.get(`remove-${kind}`) === "on" && logos[kind]) {
        logos[kind] = null;
        changed.push(`${LOGO_LABELS[kind]} weggehaald`);
      }
      const file = await storeBrandLogoUpload(formData.get(kind), owner.id);
      if (file) {
        logos[kind] = file.id;
        changed.push(`${LOGO_LABELS[kind]} geüpload`);
      }
    }
  } catch (err) {
    if (err instanceof UploadError) done(path, err.message, true);
    throw err;
  }
  if (changed.length === 0) done(path, "Kies eerst een logo om te uploaden.", true);
  await saveBrandLogos(logos);
  await audit(owner, "Logo's aangepast", changed.join(", "));
  done(path, "Logo's opgeslagen. Nieuwe mails hebben meteen het nieuwe logo; een app op het beginscherm pakt het op na opnieuw installeren.");
}
