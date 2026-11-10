"use client";

import { useRef } from "react";

/**
 * A photo in a message that opens large on the page when clicked (feedback Sabine), closed
 * with the cross, Escape or a click next to it. Without JavaScript the link opens the photo itself.
 */
export function PhotoLightbox({ src, alt, className, children }: { src: string; alt: string; className?: string; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <a
        href={src}
        target="_blank"
        rel="noopener"
        className={className}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || !dialog.current?.showModal) return;
          event.preventDefault();
          dialog.current.showModal();
        }}
      >
        {children}
      </a>
      <dialog
        ref={dialog}
        aria-label={alt || "Foto"}
        className="m-auto max-h-[95vh] max-w-[95vw] overflow-visible bg-transparent p-0 backdrop:bg-ink/85"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- attachment behind a login check */}
        <img src={src} alt={alt} className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain shadow-xl" />
        <div className="mt-2 flex justify-center gap-3 text-sm">
          <a href={src} target="_blank" rel="noopener" className="rounded-full bg-white/90 px-3 py-1 text-ink">Openen in nieuw tabblad</a>
          <button type="button" onClick={() => dialog.current?.close()} className="rounded-full bg-white px-3 py-1 font-medium text-ink" autoFocus>
            Sluiten
          </button>
        </div>
      </dialog>
    </>
  );
}
