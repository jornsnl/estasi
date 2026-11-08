/**
 * What may be uploaded where, shared by the browser (checks before uploading)
 * and the server (checks again before accepting). No server imports here.
 *
 * Supabase Free allows 50 MB per file; the bucket is capped at that, the
 * kinds below stay under it.
 */

export type UploadKind = "image" | "document" | "audio" | "pdf" | "video";

const MB = 1024 * 1024;

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export const UPLOAD_KINDS: Record<UploadKind, { extensions: string[]; maxBytes: number; label: string }> = {
  // Photos are made smaller in the browser before they are sent, so the
  // stored file is far below this; the limit is for what the browser accepts.
  image: { extensions: ["jpg", "jpeg", "png", "webp"], maxBytes: 15 * MB, label: "foto" },
  document: {
    extensions: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "jpg", "jpeg", "png", "webp", "heic"],
    maxBytes: 25 * MB,
    label: "document",
  },
  audio: { extensions: ["mp3", "m4a", "aac", "wav"], maxBytes: 45 * MB, label: "audiobestand" },
  pdf: { extensions: ["pdf"], maxBytes: 25 * MB, label: "PDF" },
  video: { extensions: ["mp4", "webm", "mov"], maxBytes: 45 * MB, label: "video" },
};

/** Photos the browser may decode and shrink (HEIC only works in Safari). */
export const SHRINKABLE = ["jpg", "jpeg", "png", "webp", "heic"];

export const extensionOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

/** The content type is decided by the extension, never by what the browser claims. */
export const mimeFor = (ext: string) => MIME[ext] ?? "application/octet-stream";

export const acceptFor = (kind: UploadKind) =>
  // Photo pickers also offer HEIC: Safari turns it into JPG before uploading.
  [...UPLOAD_KINDS[kind].extensions, ...(kind === "image" ? ["heic"] : [])].map((e) => `.${e}`).join(",");

export const formatBytes = (bytes: number) =>
  bytes >= MB ? `${(bytes / MB).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;

/** Null when the file is fine, otherwise the message to show. */
export function checkUpload(kind: UploadKind, name: string, size: number): string | null {
  const rules = UPLOAD_KINDS[kind];
  const ext = extensionOf(name);
  if (!rules.extensions.includes(ext)) {
    return ext ? `Bestandstype .${ext} is hier niet toegestaan.` : "Dit bestand heeft geen herkenbaar type.";
  }
  if (size <= 0) return "Dit bestand is leeg.";
  if (size > rules.maxBytes) return `Bestand is groter dan ${formatBytes(rules.maxBytes)}.`;
  return null;
}

/** File names end up in headers and lists: no paths, no control characters. */
export const cleanFileName = (name: string) =>
  name.replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || "bestand";
