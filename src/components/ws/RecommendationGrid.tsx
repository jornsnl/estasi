"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toggleFavorite } from "@/app/actions/ws-suppliers";
import { instagramHref, instagramLabel, professionAndRegion, telHref, websiteHref } from "@/lib/ws/recommendations";

export interface RecommendationCard {
  id: string;
  name: string;
  profession: string;
  region: string;
  contactPerson: string;
  phone: string;
  email: string;
  website: string;
  instagram: string;
  description: string;
  workArea: string;
  priceIndication: string;
  availability: string;
  photo: string | null;
  brochure: string | null;
  experience: string;
}

/** Category dropdown that opens the chosen category. */
export function CategorySelect({ id, base, categories, current }: { id: string; base: string; categories: { id: string; name: string }[]; current: string }) {
  const router = useRouter();
  return (
    <select
      id={id}
      value={current}
      onChange={(e) => router.push(`${base}?categorie=${e.target.value}`)}
      className="input max-w-sm"
    >
      {categories.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
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

interface Detail {
  label: string;
  value: string;
  href?: string;
  external?: boolean;
}

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

  const contacts: Detail[] = open
    ? [
        { label: "Contactpersoon", value: open.contactPerson },
        { label: "Telefoon", value: open.phone, href: telHref(open.phone) },
        { label: "E-mail", value: open.email, href: `mailto:${open.email}` },
        { label: "Website", value: open.website.replace(/^https?:\/\//i, ""), href: websiteHref(open.website), external: true },
        { label: "Instagram", value: instagramLabel(open.instagram), href: instagramHref(open.instagram), external: true },
      ].filter((c) => c.value.trim() !== "")
    : [];
  const labels: Detail[] = open
    ? [
        { label: "Werkgebied", value: open.workArea },
        { label: "Prijsindicatie", value: open.priceIndication },
        { label: "Beschikbaarheid", value: open.availability },
      ].filter((c) => c.value.trim() !== "")
    : [];

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => show(item)}
              aria-haspopup="dialog"
              className="group flex w-full flex-col overflow-hidden rounded-2xl bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow focus-visible:-translate-y-0.5"
            >
              <span className="relative block aspect-square w-full overflow-hidden bg-gradient-to-br from-cream-deep to-[#e2d6b8]">
                {item.photo && (
                  // eslint-disable-next-line @next/next/no-img-element -- photo behind a login check
                  <img src={item.photo} alt="" className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-[1.02]" />
                )}
                {fav.has(item.id) && (
                  <span className="absolute top-2 right-2 rounded-full bg-white/95 p-1 text-bordeaux" title="Jullie favoriet"><Heart filled /></span>
                )}
              </span>
              <span className="block p-3">
                <span className="block font-serif text-base leading-tight font-semibold">{item.name}</span>
                {item.profession && <span className="mt-0.5 block text-xs text-muted">{item.profession}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialog}
        onClose={() => setOpen(null)}
        // A click on the backdrop lands on the dialog itself: close.
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        aria-labelledby="aanrader-naam"
        className="m-auto max-h-[calc(100dvh-2rem)] outline-none w-[min(52rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl bg-white p-0 backdrop:bg-black/50"
      >
        {open && (
          <div className="relative p-5 sm:p-6">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full text-2xl leading-none text-muted hover:bg-cream hover:text-ink"
              aria-label="Sluiten"
            >
              ×
            </button>
            <header className="pr-10">
              {professionAndRegion(open.profession, open.region) && (
                <p className="eyebrow">{professionAndRegion(open.profession, open.region)}</p>
              )}
              <h2 id="aanrader-naam" className="mt-1 text-2xl sm:text-3xl">{open.name}</h2>
            </header>

            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <div className="space-y-4">
                {open.photo && (
                  // eslint-disable-next-line @next/next/no-img-element -- photo behind a login check
                  <img src={open.photo} alt={`Foto van ${open.name}`} className="aspect-square w-full rounded-xl object-cover" />
                )}
                {contacts.length > 0 && (
                  <section>
                    <h3 className="eyebrow mb-1 font-sans">Contact</h3>
                    <dl className="space-y-1 text-sm">
                      {contacts.map((c) => (
                        <div key={c.label} className="flex gap-2">
                          <dt className="w-28 shrink-0 text-muted">{c.label}</dt>
                          <dd className="min-w-0 break-words">
                            {c.href ? (
                              <a className="text-bordeaux hover:underline" href={c.href} {...(c.external ? { target: "_blank", rel: "noreferrer" } : {})}>{c.value}</a>
                            ) : c.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  {open.brochure && (
                    <a href={open.brochure} target="_blank" rel="noreferrer" className="btn-primary">Bekijk de brochure</a>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => toggle(open.id)}
                    aria-pressed={fav.has(open.id)}
                    className={`btn inline-flex items-center gap-2 border ${fav.has(open.id) ? "border-bordeaux bg-bordeaux text-white" : "border-bordeaux text-bordeaux"}`}
                  >
                    <Heart filled={fav.has(open.id)} /> Onze favoriet
                  </button>
                </div>
                {message && <p className="text-sm text-muted" role="status">{message}</p>}
              </div>

              <div className="space-y-4">
                {(open.description || labels.length > 0) && (
                  <section>
                    <h3 className="section-title mb-2">Meer informatie</h3>
                    {open.description && <p className="text-sm whitespace-pre-line">{open.description}</p>}
                    {labels.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {labels.map((l) => (
                          <li key={l.label} className="rounded-full bg-cream px-3 py-1 text-xs">
                            <span className="text-muted">{l.label}: </span>{l.value}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}
                {open.experience && (
                  <section className="rounded-xl bg-cream p-4">
                    <h3 className="section-title mb-2">Mijn ervaring</h3>
                    <p className="text-sm whitespace-pre-line">{open.experience}</p>
                    <p className="mt-3 font-serif text-sm text-gold-ink italic">Sabine, Estasi Weddings</p>
                  </section>
                )}
              </div>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
