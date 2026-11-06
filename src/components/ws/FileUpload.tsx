"use client";

import { useEffect, useId, useRef, useState } from "react";
import { requestUpload } from "@/app/actions/ws-upload";
import { acceptFor, checkUpload, extensionOf, formatBytes, SHRINKABLE, type UploadKind } from "@/lib/ws/upload-rules";

/**
 * The one upload field of Your Wedding Space.
 *
 * direct (Supabase configured): every chosen file is first made smaller when
 * it is a photo, then sent straight from the browser to Storage with a
 * one-time link; the form only carries the ids (hidden inputs named `name`).
 * Not direct, or without JavaScript: a normal file input that is sent with
 * the form.
 */

const MAX_SIDE = 2400;
const KEEP_BELOW = 2 * 1024 * 1024;
const HEIC_MESSAGE =
  "Deze foto (HEIC) kan deze browser niet openen. Kies een JPG of PNG, of zet op de iPhone bij Camera, Formaten \"Meest compatibel\" aan.";

type Item = {
  key: string;
  name: string;
  size: number;
  state: "working" | "done" | "error";
  progress: number;
  fileId?: string;
  error?: string;
};

export function FileUpload({
  name,
  coupleId,
  kind,
  direct,
  multiple = false,
  required = false,
  label = "Bestand uploaden",
  autoSubmit = false,
  id,
}: {
  name: string;
  coupleId: string | null;
  kind: UploadKind;
  direct: boolean;
  multiple?: boolean;
  required?: boolean;
  label?: string;
  /** Submit the form as soon as every chosen file has arrived. */
  autoSubmit?: boolean;
  id?: string;
}) {
  const generated = useId();
  const inputId = id ?? `upload-${generated}`;
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const busy = items.some((i) => i.state === "working");

  // The form may not be sent while files are still on their way.
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const guard = (event: SubmitEvent) => {
      const current = itemsRef.current;
      const message = current.some((i) => i.state === "working")
        ? "Even wachten: de upload is nog bezig."
        : required && direct && !current.some((i) => i.state === "done")
          ? "Kies eerst een bestand."
          : null;
      if (message) {
        event.preventDefault();
        event.stopPropagation();
        setError(message);
      }
    };
    form.addEventListener("submit", guard);
    return () => form.removeEventListener("submit", guard);
  }, [required, direct]);

  // Clear the list after the form went through (the page shows the result).
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const reset = () => setTimeout(() => setItems([]), 0);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, []);

  const update = (key: string, patch: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function handle(file: File, key: string) {
    try {
      const { blob, fileName } = kind === "image" ? await shrink(file) : { blob: file as Blob, fileName: file.name };
      const problem = checkUpload(kind, fileName, blob.size);
      if (problem) throw new Error(problem);
      update(key, { name: fileName, size: blob.size });
      const ticket = await requestUpload({ coupleId, kind, name: fileName, size: blob.size });
      if (!ticket.ok) throw new Error(ticket.error);
      await send(ticket.signedUrl, blob, ticket.mime, (progress) => update(key, { progress }));
      update(key, { state: "done", progress: 1, fileId: ticket.fileId });
    } catch (err) {
      update(key, { state: "error", error: (err as Error).message || "Uploaden mislukt." });
    }
  }

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const files = Array.from(event.target.files ?? []);
    if (!direct) {
      setItems(files.map((f, n) => ({ key: `${n}-${f.name}`, name: f.name, size: f.size, state: "done", progress: 1 })));
      return;
    }
    event.target.value = "";
    if (files.length === 0) return;
    const added = files.slice(0, multiple ? 30 : 1).map((f, n) => ({
      key: `${Date.now()}-${n}-${f.name}`,
      name: f.name,
      size: f.size,
      state: "working" as const,
      progress: 0,
    }));
    setItems((list) => (multiple ? [...list, ...added] : added));
    // Two at a time: fast on wifi, gentle on a phone connection.
    const queue = files.slice(0, added.length).map((f, n) => () => handle(f, added[n].key));
    await Promise.all([0, 1].map(async () => {
      while (queue.length) await queue.shift()!();
    }));
    if (autoSubmit && itemsRef.current.some((i) => i.state === "done") && !itemsRef.current.some((i) => i.state === "working")) {
      input.current?.form?.requestSubmit();
    }
  }

  function remove(key: string) {
    setItems((list) => list.filter((i) => i.key !== key));
    if (!direct && input.current) input.current.value = "";
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={inputId}
          className={`btn-secondary inline-flex cursor-pointer items-center gap-2 py-1.5 font-semibold ${busy ? "opacity-70" : ""}`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
          </svg>
          {busy ? "Bezig met uploaden…" : label}
        </label>
        <input
          ref={input}
          id={inputId}
          type="file"
          name={direct ? undefined : name}
          accept={acceptFor(kind)}
          multiple={multiple}
          required={required && !direct}
          onChange={onChange}
          className="sr-only"
        />
        {items.length === 0 && <span className="text-xs text-muted">Nog geen bestand gekozen</span>}
      </div>

      {items.length > 0 && (
        <ul className="space-y-1 text-sm" aria-live="polite">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.name}</span>
                {item.state === "working" && (
                  <span className="mt-1 block h-1 overflow-hidden rounded bg-line">
                    <span className="block h-1 bg-bordeaux transition-all" style={{ width: `${Math.max(5, item.progress * 100)}%` }} />
                  </span>
                )}
                {item.state === "error" && <span className="block text-xs text-red-700">{item.error}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted">
                {item.state === "done" ? `✓ ${formatBytes(item.size)}` : item.state === "working" ? `${Math.round(item.progress * 100)}%` : ""}
              </span>
              <button type="button" onClick={() => remove(item.key)} className="shrink-0 px-1 text-muted hover:text-bordeaux" aria-label={`${item.name} weghalen`}>
                ×
              </button>
              {direct && item.state === "done" && item.fileId && <input type="hidden" name={name} value={item.fileId} />}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}

/** Photos from a phone are often 5 to 15 MB; 2400 px wide is plenty on any screen. */
async function shrink(file: File): Promise<{ blob: Blob; fileName: string }> {
  const ext = extensionOf(file.name);
  if (!SHRINKABLE.includes(ext)) return { blob: file, fileName: file.name };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    if (ext === "heic") throw new Error(HEIC_MESSAGE);
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
  // JPG has no transparency: a white background instead of black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) return { blob: file, fileName: file.name };
  return { blob, fileName: `${file.name.replace(/\.[^.]+$/, "") || "foto"}.jpg` };
}

/** PUT to the signed upload URL, the same way supabase-js does it, with progress. */
function send(url: string, blob: Blob, mime: string, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Uploaden mislukt (${xhr.status}). Probeer het opnieuw.`)));
    xhr.onerror = () => reject(new Error("Geen verbinding. Controleer het internet en probeer het opnieuw."));
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", new Blob([blob], { type: mime }));
    xhr.send(body);
  });
}
