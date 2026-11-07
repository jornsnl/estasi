"use client";

import { useId, useState, useTransition } from "react";
import { addStylingItem, deleteStylingItem, movePlace, placeImages, savePlace, updateStylingItem } from "@/app/actions/ws-styling";
import { MoveButtons } from "@/components/MoveButtons";
import { SubmitButton } from "@/components/SubmitButton";
import { FileUpload } from "@/components/ws/FileUpload";

export interface PlaceData {
  id: string;
  name: string;
  items: { id: string; what: string; who: string; ready: boolean; draft: boolean }[];
  images: { id: string; file_id: string }[];
}

/**
 * The styling plan per place. mode "edit": the page Stylingplan & Moodboard
 * (both edit). mode "day": the run sheet tab, only "Klaargezet" (Sabine).
 */
export function StylingPlaces({
  coupleId,
  places,
  names,
  isAdmin,
  mode,
  direct,
}: {
  coupleId: string;
  places: PlaceData[];
  names: string[];
  isAdmin: boolean;
  mode: "edit" | "day";
  direct: boolean;
}) {
  const listId = useId();
  const [ready, setReady] = useState(() => Object.fromEntries(places.flatMap((p) => p.items.map((i) => [i.id, i.ready]))));
  const [status, setStatus] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);
  const [, start] = useTransition();
  const save = (id: string, change: Parameters<typeof updateStylingItem>[2]) =>
    start(async () => {
      const r = await updateStylingItem(coupleId, id, change);
      setStatus(r.ok ? "✓ Opgeslagen" : r.error ?? "Niet opgeslagen");
    });
  const edit = mode === "edit";
  const hidden = <input type="hidden" name="coupleId" value={coupleId} />;

  return (
    <div className="space-y-5">
      <datalist id={listId}>{names.map((n) => <option key={n} value={n} />)}</datalist>
      <p className="h-4 text-right text-xs text-muted" aria-live="polite">{status}</p>
      {places.map((place, n) => (
        <section key={place.id} id={`p-${place.id}`} className="card scroll-mt-6 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {edit ? (
              <form action={savePlace} className="flex items-center gap-2">
                {hidden}
                <input type="hidden" name="placeId" value={place.id} />
                <input name="name" defaultValue={place.name} aria-label="Naam van de plek" className="rounded-lg border border-transparent bg-transparent px-1 font-serif text-xl font-semibold hover:border-line focus:border-line focus:bg-white" />
                <SubmitButton className="btn-ghost py-1 text-xs">Hernoemen</SubmitButton>
              </form>
            ) : (
              <h3 className="font-serif text-xl font-semibold">{place.name}</h3>
            )}
            {edit && (
              <div className="flex items-center gap-1">
                <MoveButtons action={movePlace} id={place.id} first={n === 0} last={n === places.length - 1} extra={{ coupleId }} />
                <form action={savePlace} onSubmit={(e) => { if (!confirm(`Plek "${place.name}" met alles erin verwijderen?`)) e.preventDefault(); }}>
                  {hidden}
                  <input type="hidden" name="placeId" value={place.id} />
                  <button type="submit" name="intent" value="delete" className="px-2 text-xs text-muted hover:text-bordeaux">Verwijderen</button>
                </form>
              </div>
            )}
          </div>

          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-bordeaux">
              <tr><th className="pb-1 font-medium">Wat</th><th className="pb-1 font-medium">Wie regelt het</th><th className="w-24 pb-1 text-center font-medium">Klaargezet</th>{edit && <th className="w-6" />}</tr>
            </thead>
            <tbody>
              {place.items.map((item) => (
                <tr key={item.id} className={`border-t border-line align-top ${item.draft ? "bg-gold-soft/40" : ""}`}>
                  <td className="py-1.5 pr-2">
                    {edit ? (
                      <input defaultValue={item.what} aria-label="Wat" onBlur={(e) => e.target.value !== e.target.defaultValue && save(item.id, { what: e.target.value })} className="input py-1 text-sm" />
                    ) : (
                      item.what
                    )}
                    {item.draft && <span className="mt-0.5 block text-[11px] text-gold-ink">Voorstel uit de samenvatting: nog niet zichtbaar voor het bruidspaar</span>}
                  </td>
                  <td className="py-1.5 pr-2">
                    {edit ? (
                      <input list={listId} defaultValue={item.who} aria-label="Wie regelt het" placeholder="Naam (mag leeg)" onBlur={(e) => e.target.value !== e.target.defaultValue && save(item.id, { who: e.target.value })} className="input py-1 text-sm" />
                    ) : (
                      item.who
                    )}
                  </td>
                  <td className="py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={Boolean(ready[item.id])}
                      disabled={!isAdmin}
                      title={isAdmin ? undefined : "Sabine vinkt dit aan op de dag"}
                      aria-label={`${item.what} klaargezet`}
                      onChange={(e) => {
                        setReady((r) => ({ ...r, [item.id]: e.target.checked }));
                        save(item.id, { ready: e.target.checked });
                      }}
                      className="h-4 w-4 accent-[#6B1E2E]"
                    />
                  </td>
                  {edit && (
                    <td className="py-1.5 text-right">
                      <form action={deleteStylingItem}>
                        {hidden}
                        <input type="hidden" name="itemId" value={item.id} />
                        <input type="hidden" name="placeId" value={place.id} />
                        <button type="submit" className="text-muted hover:text-bordeaux" aria-label={`${item.what} verwijderen`}>×</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
              {place.items.length === 0 && <tr><td colSpan={4} className="py-2 text-muted">Nog niets voor deze plek.</td></tr>}
            </tbody>
          </table>

          {edit && (
            <form action={addStylingItem} className="mt-2 flex flex-wrap gap-2">
              {hidden}
              <input type="hidden" name="placeId" value={place.id} />
              <input name="what" required placeholder="Wat, bijvoorbeeld: Welkomstbord op ezel" aria-label={`Nieuw item voor ${place.name}`} className="input min-w-48 flex-1 py-1.5" />
              <input name="who" list={listId} placeholder="Wie regelt het" aria-label="Wie regelt het" className="input w-44 py-1.5" />
              <SubmitButton className="btn-secondary py-1.5">Toevoegen</SubmitButton>
            </form>
          )}

          {(place.images.length > 0 || edit) && (
            <div className="mt-3 flex flex-wrap items-start gap-2">
              {place.images.map((img) => (
                <div key={img.id} className="relative">
                  <button type="button" onClick={() => setZoom(`/api/ws-bestanden/${img.file_id}`)} className="block overflow-hidden rounded-lg" aria-label="Afbeelding groot bekijken">
                    {/* eslint-disable-next-line @next/next/no-img-element -- uploaded image behind a login check */}
                    <img src={`/api/ws-bestanden/${img.file_id}`} alt="" className="h-24 w-32 object-cover" />
                  </button>
                  {edit && (
                    <form action={placeImages} className="absolute top-1 right-1" onSubmit={(e) => { if (!confirm("Deze afbeelding verwijderen?")) e.preventDefault(); }}>
                      {hidden}
                      <input type="hidden" name="placeId" value={place.id} />
                      <input type="hidden" name="imageId" value={img.id} />
                      <button type="submit" className="rounded-full bg-white/90 px-1.5 text-xs" aria-label="Afbeelding verwijderen">×</button>
                    </form>
                  )}
                </div>
              ))}
              {edit && (
                <form action={placeImages} className="space-y-1">
                  {hidden}
                  <input type="hidden" name="placeId" value={place.id} />
                  <FileUpload name="images" coupleId={coupleId} kind="image" direct={direct} multiple autoSubmit label="Afbeelding toevoegen" />
                </form>
              )}
            </div>
          )}
        </section>
      ))}

      {zoom && (
        <button type="button" onClick={() => setZoom(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" aria-label="Sluiten">
          {/* eslint-disable-next-line @next/next/no-img-element -- uploaded image behind a login check */}
          <img src={zoom} alt="" className="max-h-full max-w-full rounded-lg" />
        </button>
      )}
    </div>
  );
}
