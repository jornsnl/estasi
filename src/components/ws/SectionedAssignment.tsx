"use client";

import Script from "next/script";
import { useEffect, useRef, useState, useTransition } from "react";
import { stylingImage } from "@/app/actions/ws-fase2";
import { saveSectionNote, setSectionDone } from "@/app/actions/ws-styling";
import { SubmitButton } from "@/components/SubmitButton";
import { AutoTextarea } from "@/components/ws/AutoTextarea";
import { FileUpload } from "@/components/ws/FileUpload";

export interface SectionData {
  id: string;
  title: string;
  intro: string;
  kind: "notes" | "moodboard";
  fields: { key: string; label: string; prompts: string[] }[];
  tips: string[];
  embeds: string[];
  example: string | null;
  notice: string;
  answers: Record<string, string>;
  link: string;
  done: boolean;
}

declare global {
  interface Window {
    PinUtils?: { build: () => void };
  }
}

/**
 * An assignment in parts (Thema & Styling): notes save themselves, a tick per
 * part ("Opdracht afgerond") never hides anything, a progress bar on top and
 * the closing words once every part is done.
 */
export function SectionedAssignment({
  coupleId,
  intro,
  closing,
  sections,
  moodboard,
  direct,
  back,
}: {
  coupleId: string;
  intro: string;
  closing: string;
  sections: SectionData[];
  moodboard: { id: string; file_id: string }[];
  direct: boolean;
  back: string;
}) {
  const [done, setDone] = useState(() => Object.fromEntries(sections.map((s) => [s.id, s.done])));
  const [, start] = useTransition();
  const count = Object.values(done).filter(Boolean).length;
  const allDone = count === sections.length && sections.length > 0;
  const hasEmbeds = sections.some((s) => s.embeds.length > 0);

  useEffect(() => {
    window.PinUtils?.build();
  }, []);

  return (
    <div className="space-y-5">
      {hasEmbeds && <Script src="https://assets.pinterest.com/js/pinit.js" strategy="lazyOnload" onLoad={() => window.PinUtils?.build()} />}
      {intro && <div className="rounded-2xl border border-gold/40 bg-cream p-5 text-[15px] leading-7">{intro}</div>}

      <div className="sticky top-0 z-10 -mx-4 bg-cream/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center justify-between text-sm">
          <strong>{count} van {sections.length} afgerond</strong>
          {allDone && <span className="text-success">Alles afgerond</span>}
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
          <div className="h-2 rounded-full bg-bordeaux transition-all" style={{ width: `${sections.length ? (count / sections.length) * 100 : 0}%` }} />
        </div>
      </div>

      {sections.map((s) => (
        <section key={s.id} className={`card space-y-4 p-5 ${done[s.id] ? "ring-1 ring-success/40" : ""}`}>
          <h2 className="text-xl">{s.title}</h2>
          {s.intro && <p className="text-sm whitespace-pre-line text-muted">{s.intro}</p>}

          {s.kind === "moodboard" && (
            <>
              {s.tips.length > 0 && (
                <div className="rounded-xl bg-cream p-4 text-sm">
                  <p className="font-medium">Tips om op te letten tijdens het verzamelen:</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">{s.tips.map((t) => <li key={t}>{t}</li>)}</ul>
                </div>
              )}
              {(s.embeds.length > 0 || s.example) && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Inspiratie</p>
                  <div className="flex flex-wrap gap-4">
                    {s.embeds.map((url) => (
                      <div key={url} className="min-w-0">
                        <a data-pin-do="embedBoard" data-pin-board-width="320" data-pin-scale-height="240" data-pin-scale-width="80" href={url} className="text-sm text-bordeaux underline" target="_blank" rel="noreferrer">
                          {url.replace(/^https:\/\/([a-z]+\.)?pinterest\.[a-z.]+\//, "Pinterest: ").replace(/\/$/, "")}
                        </a>
                      </div>
                    ))}
                    {s.example && (
                      <figure className="max-w-xs">
                        {/* eslint-disable-next-line @next/next/no-img-element -- example image behind a login check */}
                        <img src={s.example} alt="Voorbeeldmoodboard" className="rounded-xl" />
                        <figcaption className="mt-1 text-xs text-muted">Voorbeeldmoodboard</figcaption>
                      </figure>
                    )}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-sm font-medium">Jullie moodboard</p>
                {moodboard.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- uploaded images behind a login check */}
                    {moodboard.map((m) => <img key={m.id} src={`/api/ws-bestanden/${m.file_id}`} alt="" className="h-20 w-20 rounded-lg object-cover" />)}
                  </div>
                )}
                <form action={stylingImage}>
                  <input type="hidden" name="coupleId" value={coupleId} />
                  <input type="hidden" name="back" value={back} />
                  <FileUpload name="image" coupleId={coupleId} kind="image" direct={direct} multiple autoSubmit label="Afbeeldingen uploaden" />
                  {!direct && <SubmitButton className="btn-secondary mt-2 py-1.5">Uploaden</SubmitButton>}
                </form>
              </div>
              <Note coupleId={coupleId} sectionId={s.id} field="__link" label="Link naar jullie Pinterest-bord of Canva" initial={s.link} single />
            </>
          )}

          {s.fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              {f.label && <h3 className="font-serif text-lg font-semibold">{f.label}</h3>}
              {f.prompts.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-sm">{f.prompts.map((p) => <li key={p}>{p}</li>)}</ul>
              )}
              <Note coupleId={coupleId} sectionId={s.id} field={f.key} label={f.label ? `Notities ${f.label}` : "Jullie notities"} initial={s.answers?.[f.key] ?? ""} />
            </div>
          ))}

          {s.notice && <p className="rounded-xl border-l-4 border-bordeaux bg-bordeaux-soft p-4 text-sm font-medium text-bordeaux">{s.notice}</p>}

          <label className="flex items-center gap-2 border-t border-line pt-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={Boolean(done[s.id])}
              onChange={(e) => {
                const on = e.target.checked;
                setDone((d) => ({ ...d, [s.id]: on }));
                start(async () => {
                  await setSectionDone(coupleId, s.id, on);
                });
              }}
              className="h-5 w-5 accent-[#6B1E2E]"
            />
            Opdracht afgerond
          </label>
        </section>
      ))}

      {allDone && closing && <div className="card border border-success/40 bg-success-soft p-6 text-[15px] leading-7">{closing}</div>}
    </div>
  );
}

/** A note field that grows with the text and saves itself a moment after typing stops. */
function Note({ coupleId, sectionId, field, label, initial, single = false }: { coupleId: string; sectionId: string; field: string; label: string; initial: string; single?: boolean }) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(initial);
  const save = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (text === last.current) return;
    setState("saving");
    saveSectionNote(coupleId, sectionId, field, text).then((r) => {
      if (r.ok) last.current = text;
      setState(r.ok ? "saved" : "error");
    });
  };
  const change = (text: string) => {
    setValue(text);
    setState("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(text), 1500);
  };
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="label mb-0">{label}</span>
        <span className="text-xs text-muted" aria-live="polite">{state === "saving" ? "Opslaan…" : state === "saved" ? "✓ Opgeslagen" : state === "error" ? "Niet opgeslagen" : ""}</span>
      </div>
      {single ? (
        <input value={value} onChange={(e) => change(e.target.value)} onBlur={() => save(value)} aria-label={label} placeholder="https://" className="input mt-1" />
      ) : (
        <AutoTextarea value={value} onChange={(e) => change(e.target.value)} onBlur={() => save(value)} aria-label={label} className="input mt-1 min-h-24" />
      )}
    </div>
  );
}
