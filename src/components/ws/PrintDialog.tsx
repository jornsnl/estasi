"use client";

import { useEffect, useRef, useState } from "react";

const KEY = "ws-print-tabs";

/**
 * "Draaiboek printen": choose the tabs (plus cover and table of contents).
 * The last choice is remembered in this browser.
 */
export function PrintDialog({ href, tabs }: { href: string; tabs: { key: string; title: string }[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const all = ["cover", "toc", ...tabs.map((t) => t.key)];
  const [chosen, setChosen] = useState<string[]>(all);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (Array.isArray(saved)) setChosen(saved.filter((k: string) => all.includes(k)));
    } catch {
      // No storage: everything stays selected.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on opening the page
  }, []);
  const toggle = (key: string, on: boolean) => setChosen((c) => (on ? [...c, key] : c.filter((k) => k !== key)));
  const go = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(chosen));
    } catch {
      // Not remembered; printing works anyway.
    }
    const order = all.filter((k) => chosen.includes(k));
    window.open(`${href}?tabs=${encodeURIComponent(order.join(","))}&print=1`, "_blank", "noopener");
    dialog.current?.close();
  };
  const box = (key: string, label: string) => (
    <label key={key} className="flex items-center gap-2 py-0.5 text-sm">
      <input type="checkbox" checked={chosen.includes(key)} onChange={(e) => toggle(key, e.target.checked)} className="accent-[#6B1E2E]" /> {label}
    </label>
  );
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className="btn-secondary">Draaiboek printen</button>
      <dialog ref={dialog} className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl p-5 backdrop:bg-black/40">
        <h2 className="text-xl">Draaiboek printen</h2>
        <p className="mt-1 text-sm text-muted">Kies wat er in de PDF komt. Elk tabblad begint op een nieuwe pagina.</p>
        <div className="mt-3 flex gap-3 text-xs">
          <button type="button" onClick={() => setChosen(all)} className="text-bordeaux underline">Alles selecteren</button>
          <button type="button" onClick={() => setChosen([])} className="text-bordeaux underline">Alles deselecteren</button>
        </div>
        <div className="mt-2">
          {box("cover", "Voorblad")}
          {box("toc", "Inhoudsopgave")}
          {tabs.map((t) => box(t.key, t.title))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => dialog.current?.close()} className="btn-ghost">Annuleren</button>
          <button type="button" onClick={go} disabled={chosen.length === 0} className="btn-primary disabled:opacity-50">PDF maken</button>
        </div>
      </dialog>
    </>
  );
}
