"use client";

import { useEffect, useId, useRef, useState } from "react";
import { HEIC_MESSAGE, shrinkPhoto } from "@/lib/shrink-photo";

/**
 * The photo field of the Academy forms (feedback Sabine: photos were not uploaded, and she
 * wants a save button next to every photo upload).
 *
 * A normal file input that is sent with the form, so it works without JavaScript too. With
 * JavaScript a chosen photo is first made smaller in the browser (src/lib/shrink-photo.ts),
 * a preview is shown, and a save button appears right next to it. The form cannot be sent
 * while a photo is still being made smaller.
 */
export function PhotoInput({
  name,
  label,
  accept = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif",
  shrink = true,
  maxBytes = 10 * 1024 * 1024,
  saveLabel = "Foto opslaan",
  className = "",
}: {
  name: string;
  /** Accessible name of the input. */
  label: string;
  accept?: string;
  /** False for logos (SVG, png with transparency): sent as they are. */
  shrink?: boolean;
  maxBytes?: number;
  saveLabel?: string;
  className?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "working" | "ready" | "error">("idle");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const guard = (event: SubmitEvent) => {
      if (stateRef.current === "working") {
        event.preventDefault();
        setMessage("Even wachten: de foto wordt nog klaargemaakt.");
      } else if (stateRef.current === "error") {
        event.preventDefault();
      }
    };
    form.addEventListener("submit", guard);
    return () => form.removeEventListener("submit", guard);
  }, []);

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const field = event.target;
    const file = field.files?.[0];
    setPreview(null);
    if (!file) {
      setState("idle");
      setMessage("");
      return;
    }
    setState("working");
    setMessage("Foto wordt klaargemaakt…");
    try {
      const ready = shrink ? await shrinkPhoto(file) : file;
      if (ready.size > maxBytes) throw new Error(`De foto is groter dan ${Math.round(maxBytes / 1024 / 1024)} MB. Kies een kleinere foto.`);
      if (ready !== file && typeof DataTransfer !== "undefined") {
        const transfer = new DataTransfer();
        transfer.items.add(ready);
        field.files = transfer.files;
      }
      if (ready.type.startsWith("image/") && ready.type !== "image/heic") setPreview(URL.createObjectURL(ready));
      setState("ready");
      setMessage(`Klaar om op te slaan (${formatSize(ready.size)}).`);
    } catch (err) {
      field.value = "";
      setState("error");
      setMessage((err as Error).message || HEIC_MESSAGE);
    }
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} id={id} type="file" name={name} accept={accept} onChange={onChange} aria-label={label} className="min-w-0 max-w-full text-sm" />
        {(state === "ready" || state === "working") && (
          <button
            type="button"
            disabled={state === "working"}
            onClick={() => input.current?.form?.requestSubmit()}
            className="btn-primary px-3 py-1.5 text-sm"
          >
            {state === "working" ? "Even wachten…" : saveLabel}
          </button>
        )}
      </div>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen photo
        <img src={preview} alt="" className="h-20 w-auto max-w-[12rem] rounded-lg border border-line object-cover" />
      )}
      {message && (
        <p role={state === "error" ? "alert" : "status"} className={`text-xs ${state === "error" ? "text-bordeaux" : "text-muted"}`}>
          {message}
        </p>
      )}
    </div>
  );
}

const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
