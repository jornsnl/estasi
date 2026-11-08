"use client";

import { useEffect, useId, useRef, useState } from "react";
import { uploadCommunityFile } from "@/app/actions/community";
import { ACCEPT_ATTACHMENTS, classifyAttachment, MAX_ATTACHMENTS } from "@/lib/community/rules";
import { formatBytes } from "@/lib/ws/upload-rules";

/**
 * Photos, short videos and files for a post, comment or private message.
 * Every file goes to the server on its own as soon as it is chosen (photos
 * are made smaller first, like in Your Wedding Space); the form only carries
 * the ids as hidden fields named "attachments".
 */

const MAX_SIDE = 2400;
const KEEP_BELOW = 2 * 1024 * 1024;

type Item = { key: string; name: string; size: number; state: "working" | "done" | "error"; id?: string; error?: string };

export function AttachmentPicker({ conversation = "", compact = false }: { conversation?: string; compact?: boolean }) {
  const inputId = `bijlage-${useId()}`;
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [error, setError] = useState<string | null>(null);
  const busy = items.some((i) => i.state === "working");

  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const guard = (event: SubmitEvent) => {
      if (itemsRef.current.some((i) => i.state === "working")) {
        event.preventDefault();
        event.stopPropagation();
        setError("Even wachten: het uploaden is nog bezig.");
      }
    };
    const reset = () => setTimeout(() => setItems([]), 0);
    form.addEventListener("submit", guard);
    form.addEventListener("reset", reset);
    return () => {
      form.removeEventListener("submit", guard);
      form.removeEventListener("reset", reset);
    };
  }, []);

  const update = (key: string, patch: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function handle(file: File, key: string) {
    try {
      const { blob, fileName } = await shrink(file);
      const check = classifyAttachment(fileName, blob.size);
      if (!check.ok) throw new Error(check.error);
      update(key, { name: fileName, size: blob.size });
      const body = new FormData();
      body.append("file", new File([blob], fileName, { type: check.mime }));
      body.append("conversation", conversation);
      const result = await uploadCommunityFile(body);
      if (!result.ok) throw new Error(result.error);
      update(key, { state: "done", id: result.attachment.id });
    } catch (err) {
      update(key, { state: "error", error: (err as Error).message || "Uploaden mislukt." });
    }
  }

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = "";
    const room = MAX_ATTACHMENTS - itemsRef.current.filter((i) => i.state !== "error").length;
    if (chosen.length > room) setError(`Maximaal ${MAX_ATTACHMENTS} bijlagen per bericht.`);
    const files = chosen.slice(0, Math.max(0, room));
    const added = files.map((f, n) => ({ key: `${Date.now()}-${n}-${f.name}`, name: f.name, size: f.size, state: "working" as const }));
    setItems((list) => [...list, ...added]);
    for (let n = 0; n < files.length; n++) await handle(files[n], added[n].key);
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-cream hover:text-ink ${busy ? "opacity-70" : ""}`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
        </svg>
        {busy ? "Bezig met uploaden…" : compact ? "Bijlage" : "Foto, video of bestand"}
      </label>
      <input ref={input} id={inputId} type="file" multiple accept={`${ACCEPT_ATTACHMENTS},.heic`} onChange={onChange} className="sr-only" />
      {items.length > 0 && (
        <ul className="space-y-1 text-sm" aria-live="polite">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.name}</span>
                {item.state === "error" && <span className="block text-xs text-bordeaux">{item.error}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted">
                {item.state === "done" ? `✓ ${formatBytes(item.size)}` : item.state === "working" ? "uploaden…" : ""}
              </span>
              <button
                type="button"
                onClick={() => setItems((list) => list.filter((i) => i.key !== item.key))}
                className="shrink-0 px-1 text-muted hover:text-bordeaux"
                aria-label={`${item.name} weghalen`}
              >
                ×
              </button>
              {item.state === "done" && item.id && <input type="hidden" name="attachments" value={item.id} />}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="text-sm text-bordeaux" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** As in Your Wedding Space (src/components/ws/FileUpload.tsx): photos at most 2400 px, JPG. */
async function shrink(file: File): Promise<{ blob: Blob; fileName: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["jpg", "jpeg", "png", "webp", "heic"].includes(ext)) return { blob: file, fileName: file.name };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    if (ext === "heic") throw new Error("Deze foto (HEIC) kan deze browser niet openen. Kies een JPG of PNG.");
    return { blob: file, fileName: file.name };
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= KEEP_BELOW && ext !== "heic") {
    bitmap.close();
    return { blob: file, fileName: file.name };
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) return { blob: file, fileName: file.name };
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) return { blob: file, fileName: file.name };
  return { blob, fileName: `${file.name.replace(/\.[^.]+$/, "") || "foto"}.jpg` };
}
