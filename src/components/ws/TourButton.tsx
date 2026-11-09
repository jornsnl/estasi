"use client";

import { useRef, useState } from "react";
import { SettingVideo } from "@/components/ws/SettingVideo";

export const TOUR_TEXT = "Welkom in Your Wedding Space! In deze video laat ik jullie zien hoe alles werkt.";

/**
 * "Bekijk de rondleiding" (feedback 11): opens the tour video in a pop-up.
 * The video does not start by itself and is removed when the pop-up closes
 * (cross, Escape or a click outside), so it never keeps playing.
 */
export function TourButton({
  fileId,
  url,
  className = "btn-primary",
  title = "De rondleiding",
  text = TOUR_TEXT,
}: {
  fileId: string | null;
  url: string;
  className?: string;
  /** Title and text of the pop-up, set by Sabine (Systeem > Rondleiding). */
  title?: string;
  text?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const show = () => {
    setOpen(true);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();
  return (
    <>
      <button type="button" onClick={show} className={`${className} inline-flex items-center gap-2`}>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 6.5v7l5.5-3.5z" />
        </svg>
        Bekijk de rondleiding
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="rondleiding-titel"
        onClose={() => setOpen(false)}
        // A click on the backdrop lands on the dialog itself, not on its contents.
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="m-auto w-[min(56rem,calc(100vw-2rem))] rounded-2xl bg-white p-0 backdrop:bg-black/60"
      >
        <div className="p-4 sm:p-6">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <h2 id="rondleiding-titel" className="text-xl">{title}</h2>
              {text && <p className="mt-1 text-sm whitespace-pre-line text-muted">{text}</p>}
            </div>
            <button type="button" onClick={close} aria-label="Sluiten" title="Sluiten" className="-mt-1 -mr-1 rounded-full px-2.5 py-1 text-2xl leading-none text-muted hover:bg-cream hover:text-ink">
              ×
            </button>
          </div>
          {open && <SettingVideo fileId={fileId} url={url} title="Rondleiding door Your Wedding Space" />}
        </div>
      </dialog>
    </>
  );
}
