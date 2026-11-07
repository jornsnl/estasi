"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toggleFavorite } from "@/app/actions/ws-suppliers";

export interface RecommendationCard {
  id: string;
  name: string;
  profession: string;
  phone: string;
  email: string;
  website: string;
  photo: string | null;
  brochure: string | null;
  experience: string;
}

/** Category dropdown that opens the chosen category. */
export function CategorySelect({ base, categories, current }: { base: string; categories: { id: string; name: string; count: number }[]; current: string }) {
  const router = useRouter();
  return (
    <select
      aria-label="Kies een categorie"
      value={current}
      onChange={(e) => router.push(`${base}?categorie=${e.target.value}`)}
      className="input max-w-sm"
    >
      <option value="" disabled>Kies een categorie</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>{c.name} ({c.count})</option>
      ))}
    </select>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" strokeLinejoin="round" />
    </svg>
  );
}

const href = (url: string) => (/^https?:\/\//.test(url) ? url : `https://${url}`);

export function RecommendationGrid({ coupleId, items, favorites }: { coupleId: string; items: RecommendationCard[]; favorites: string[] }) {
  const [fav, setFav] = useState(() => new Set(favorites));
  const [open, setOpen] = useState<RecommendationCard | null>(null);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);

  const show = (item: RecommendationCard) => {
    setOpen(item);
    setMessage("");
    dialog.current?.showModal();
  };
  const toggle = (id: string) =>
    start(async () => {
      const result = await toggleFavorite(coupleId, id);
      setFav((current) => {
        const next = new Set(current);
        if (result.favorite) next.add(id);
        else next.delete(id);
        return next;
      });
      setMessage(result.message ?? (result.favorite ? "Toegevoegd aan Jullie leveranciers als Huidige favoriet." : "Niet meer als favoriet."));
    });

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => show(item)}
            className="group relative aspect-square overflow-hidden rounded-2xl bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow"
          >
            {item.photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- photo behind a login check
              <img src={item.photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <span className="absolute inset-0 bg-gradient-to-br from-cream-deep to-[#e2d6b8]" />
            )}
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10 text-white">
              <span className="block font-serif text-base leading-tight font-semibold">{item.name}</span>
              {item.profession && <span className="block text-xs opacity-90">{item.profession}</span>}
            </span>
            {fav.has(item.id) && (
              <span className="absolute top-2 right-2 rounded-full bg-white/95 p-1 text-bordeaux" title="Jullie favoriet"><Heart filled /></span>
            )}
          </button>
        ))}
      </div>

      <dialog
        ref={dialog}
        onClose={() => setOpen(null)}
        className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-2xl p-0 backdrop:bg-black/50"
      >
        {open && (
          <div>
            {open.photo && (
              // eslint-disable-next-line @next/next/no-img-element -- photo behind a login check
              <img src={open.photo} alt={`Foto van ${open.name}`} className="max-h-80 w-full object-cover" />
            )}
            <div className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl">{open.name}</h2>
                  {open.profession && <p className="text-gold-ink">{open.profession}</p>}
                </div>
                <button type="button" onClick={() => dialog.current?.close()} className="text-2xl leading-none text-muted hover:text-ink" aria-label="Sluiten">×</button>
              </div>
              <dl className="space-y-1 text-sm">
                {open.phone && <div><dt className="inline text-muted">Telefoon: </dt><dd className="inline"><a className="text-bordeaux" href={`tel:${open.phone.replace(/\s/g, "")}`}>{open.phone}</a></dd></div>}
                {open.email && <div><dt className="inline text-muted">E-mail: </dt><dd className="inline"><a className="text-bordeaux" href={`mailto:${open.email}`}>{open.email}</a></dd></div>}
                {open.website && <div><dt className="inline text-muted">Website: </dt><dd className="inline"><a className="break-all text-bordeaux" href={href(open.website)} target="_blank" rel="noreferrer">{open.website}</a></dd></div>}
              </dl>
              {open.experience && (
                <div className="rounded-xl bg-cream p-4">
                  <p className="eyebrow mb-1">Ervaring van Sabine</p>
                  <p className="text-sm whitespace-pre-line">{open.experience}</p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => toggle(open.id)}
                  aria-pressed={fav.has(open.id)}
                  className={`btn inline-flex items-center gap-2 border ${fav.has(open.id) ? "border-bordeaux bg-bordeaux text-white" : "border-bordeaux text-bordeaux"}`}
                >
                  <Heart filled={fav.has(open.id)} /> Onze favoriet
                </button>
                {open.brochure && <a href={open.brochure} className="btn-secondary" download>Brochure downloaden</a>}
              </div>
              {message && <p className="text-sm text-muted" role="status">{message}</p>}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
