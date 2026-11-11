import "server-only";
import type { Block, BlockType, FileRef } from "@/lib/data";
import { cleanAssignment } from "@/lib/domain/assignment";
import { newId } from "@/lib/util/id";
import { isHeadingStyle } from "@/lib/domain/blocks";
import { sanitizeLessonHtml } from "@/lib/domain/html";
import { LIMITS, normaliseUrl } from "@/lib/domain/input";
import { storeImageUpload, storeUpload, UploadError } from "@/lib/uploads";

/**
 * Reading one block from the lesson editor form. Field names start with
 * "b.<blockId>."; a block whose fields are not in the form stays as it is.
 * One reader per block type (a new type adds its reader to READERS).
 * A rejected upload does not stop the rest: the block keeps its current
 * file and the problem is reported in uploadErrors.
 */
export interface BlockInput {
  formData: FormData;
  ownerId: string;
  uploadErrors: string[];
  /** A field of this block, trimmed and cut to max. */
  f: (name: string, max: number) => string;
  checked: (name: string) => boolean;
  raw: (name: string) => FormDataEntryValue | null;
  has: (name: string) => boolean;
}

type Reader<T extends BlockType> = (current: Extract<Block, { type: T }>, input: BlockInput) => Promise<Block> | Block;

async function upload(input: BlockInput, run: () => Promise<FileRef | null>): Promise<FileRef | null> {
  try {
    return await run();
  } catch (err) {
    if (!(err instanceof UploadError)) throw err;
    input.uploadErrors.push(err.message);
    return null;
  }
}

const READERS: { [T in BlockType]: Reader<T> } = {
  heading: (b, { f }) => {
    const style = f("style", 20);
    return { ...b, style: isHeadingStyle(style) ? style : b.style, text: f("text", LIMITS.caption) };
  },
  goals: (b, { f }) => ({
    ...b,
    title: f("title", 120) || "Leerdoelen",
    // One goal per line; empty lines dropped.
    items: f("items", 4000).split("\n").map((l) => l.replace(/^[\s•*-]+/, "").trim()).filter(Boolean).slice(0, 20).map((l) => l.slice(0, 300)),
  }),
  video: (b, { f }) => ({ ...b, url: normaliseUrl(f("url", LIMITS.url)), caption: f("caption", LIMITS.caption) }),
  text: (b, { has, raw }) => {
    // The editor's hidden field only exists once the editor has loaded: without it, nothing changes.
    if (!has("html")) return b;
    const html = sanitizeLessonHtml(String(raw("html") ?? "").slice(0, LIMITS.html));
    // From now on this block is HTML; the old Markdown is replaced by it.
    return { ...b, html, markdown: "" };
  },
  image: async (b, input) => {
    const file = await upload(input, () => storeImageUpload(input.raw("file"), input.ownerId));
    return { ...b, alt: input.f("alt", LIMITS.alt), caption: input.f("caption", LIMITS.caption), file: file ?? b.file };
  },
  download: async (b, input) => {
    const file = await upload(input, () => storeUpload(input.raw("file"), { belongsTo: null, uploadedBy: input.ownerId }));
    return {
      ...b,
      label: input.f("label", LIMITS.downloadLabel),
      description: input.f("description", LIMITS.downloadDescription),
      url: normaliseUrl(input.f("url", LIMITS.url)),
      file: file ?? (input.checked("removeFile") ? null : b.file),
    };
  },
  feedback: (b) => b,
  assignment: (b, { raw }) => {
    // The assignment editor keeps the whole assignment as JSON in one hidden field; cleaned up here.
    const value = raw("assignment");
    if (typeof value !== "string") return b;
    try {
      return cleanAssignment(JSON.parse(value), b.id, newId);
    } catch {
      return b;
    }
  },
};

export async function readBlock(current: Block, formData: FormData, ownerId: string, uploadErrors: string[]): Promise<Block> {
  if (!formData.has(`b.${current.id}.present`)) return current;
  const key = (name: string) => `b.${current.id}.${name}`;
  const input: BlockInput = {
    formData,
    ownerId,
    uploadErrors,
    f: (name, max) => String(formData.get(key(name)) ?? "").trim().slice(0, max),
    checked: (name) => formData.get(key(name)) === "on",
    raw: (name) => formData.get(key(name)),
    has: (name) => formData.has(key(name)),
  };
  const reader = READERS[current.type] as Reader<BlockType> | undefined;
  return reader ? reader(current as never, input) : current;
}
