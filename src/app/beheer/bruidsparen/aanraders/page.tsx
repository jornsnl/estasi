import { deleteRecommendation, moveRecommendation, saveRecommendation, toggleRecommendationVisible } from "@/app/actions/ws-suppliers";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { AutoTextarea } from "@/components/ws/AutoTextarea";
import { FileUpload } from "@/components/ws/FileUpload";
import { query } from "@/lib/ws/db";
import { directUploads } from "@/lib/ws/files";
import type { Recommendation } from "@/lib/ws/types";

export const metadata = { title: "Aanraders" };

export default async function RecommendationsAdmin({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [categories, recs] = await Promise.all([
    query<{ id: string; name: string }>("select id, name from supplier_categories where couple_id is null and not archived order by position, name"),
    query<Recommendation & { favorites: number }>(
      `select r.*, (select count(*)::int from couple_suppliers s where s.recommendation_id = r.id) as favorites
         from recommendations r order by r.position, r.name, r.id`,
    ),
  ]);
  const direct = directUploads();

  const text = (r: Recommendation | undefined, name: string, label: string, value: string | undefined, extra: Record<string, string | boolean> = {}) => {
    const id = `${name}-${r?.id ?? "new"}`;
    return (
      <div>
        <label className="label" htmlFor={id}>{label}</label>
        <input id={id} name={name} defaultValue={value} className="input" {...extra} />
      </div>
    );
  };

  const form = (r?: Recommendation) => (
    <form action={saveRecommendation} className="grid gap-3 sm:grid-cols-2">
      {r && <input type="hidden" name="recommendationId" value={r.id} />}
      {text(r, "name", "Bedrijfsnaam *", r?.name, { required: true, maxLength: "200" })}
      <div>
        <label className="label" htmlFor={`cat-${r?.id ?? "new"}`}>Categorie *</label>
        <select id={`cat-${r?.id ?? "new"}`} name="categoryId" required defaultValue={r?.category_id ?? ""} className="input">
          <option value="" disabled>Kies een categorie</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {text(r, "profession", "Beroep *", r?.profession, { required: true, maxLength: "120", placeholder: "Bijvoorbeeld: Bruidsfotograaf" })}
      {text(r, "region", "Regio", r?.region, { maxLength: "120", placeholder: "Bijvoorbeeld: Utrecht" })}
      {text(r, "contactPerson", "Contactpersoon", r?.contact_person, { maxLength: "200" })}
      {text(r, "phone", "Telefoon", r?.phone, { type: "tel", maxLength: "60" })}
      {text(r, "email", "E-mail", r?.email, { type: "email", maxLength: "200" })}
      {text(r, "website", "Website", r?.website, { maxLength: "300", placeholder: "www.voorbeeld.nl" })}
      {text(r, "instagram", "Instagram", r?.instagram, { maxLength: "300", placeholder: "@account of link" })}
      {text(r, "workArea", "Werkgebied", r?.work_area, { maxLength: "200", placeholder: "Bijvoorbeeld: heel Nederland" })}
      {text(r, "priceIndication", "Prijsindicatie", r?.price_indication, { maxLength: "200", placeholder: "Bijvoorbeeld: vanaf € 1.500" })}
      {text(r, "availability", "Beschikbaarheid", r?.availability, { maxLength: "200", placeholder: "Bijvoorbeeld: 2027 nog ruimte" })}
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`d-${r?.id ?? "new"}`}>Meer informatie</label>
        <AutoTextarea id={`d-${r?.id ?? "new"}`} name="description" defaultValue={r?.description} className="input min-h-20" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`x-${r?.id ?? "new"}`}>Mijn ervaring</label>
        <AutoTextarea id={`x-${r?.id ?? "new"}`} name="experience" defaultValue={r?.experience} className="input min-h-20" />
      </div>
      <div className="text-sm">
        <p className="label">Foto</p>
        <FileUpload name="photo" coupleId={null} kind="image" direct={direct} label={r?.photo_file_id ? "Andere foto" : "Foto uploaden"} />
        {r?.photo_file_id && <label className="mt-1 flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="removePhoto" /> Foto verwijderen</label>}
      </div>
      <div className="text-sm">
        <p className="label">Brochure (PDF)</p>
        <FileUpload name="brochure" coupleId={null} kind="pdf" direct={direct} label={r?.brochure_file_id ? "Andere brochure" : "Brochure uploaden"} />
        {r?.brochure_file_id && (
          <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
            <a href={`/api/ws-bestanden/${r.brochure_file_id}`} target="_blank" rel="noreferrer" className="text-bordeaux hover:underline">Huidige brochure bekijken</a>
            <label className="flex items-center gap-2"><input type="checkbox" name="removeBrochure" /> Brochure verwijderen</label>
          </p>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="visible" defaultChecked={!r?.archived} /> Zichtbaar voor de bruidsparen
      </label>
      <div className="sm:col-span-2"><SubmitButton className="btn-primary" pendingText="Opslaan…">{r ? "Opslaan" : "Aanrader toevoegen"}</SubmitButton></div>
    </form>
  );

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <p className="eyebrow">Beheer</p>
        <h1 className="mt-1 text-3xl">Aanraders van Estasi</h1>
        <p className="mt-1 text-sm text-muted">
          Eén lijst voor alle bruidsparen. Bruidsparen met een Weddingplanner- of Ceremoniemeesterpakket zien de zichtbare aanraders per categorie, in de volgorde hieronder. Een nieuwe favoriet zie je op je dashboard en per mail.
        </p>
      </header>
      <Notice searchParams={searchParams} />

      {categories.map((c) => {
        const list = recs.filter((r) => r.category_id === c.id);
        if (list.length === 0) return null;
        return (
          <section key={c.id} id={`c-${c.id}`} className="scroll-mt-6 space-y-2">
            <h2 className="section-title">{c.name}</h2>
            {list.map((r, n) => (
              <div key={r.id} id={`r-${r.id}`} className={`card scroll-mt-6 p-4 ${r.archived ? "bg-[#f1f0ee]" : ""}`}>
                <div className="flex flex-wrap items-center gap-3">
                  {r.photo_file_id ? (
                    // eslint-disable-next-line @next/next/no-img-element -- photo behind a login check
                    <img src={`/api/ws-bestanden/${r.photo_file_id}`} alt="" className={`h-12 w-12 rounded-xl object-cover ${r.archived ? "opacity-50" : ""}`} />
                  ) : (
                    <span className="h-12 w-12 rounded-xl bg-cream-deep" />
                  )}
                  <span className="min-w-40 flex-1">
                    <span className={`block font-medium ${r.archived ? "text-muted" : ""}`}>
                      {r.name}
                      {r.archived && <span className="ml-2 rounded-full bg-[#ecebe8] px-2 py-0.5 text-xs font-normal text-muted">Verborgen</span>}
                    </span>
                    <span className="text-xs text-muted">
                      {[r.profession, r.region].filter(Boolean).join(" · ")}{r.favorites ? ` · ${r.favorites}× gekozen` : ""}
                    </span>
                  </span>
                  <div className="flex items-center gap-1">
                    {(["up", "down"] as const).map((dir) => {
                      const disabled = dir === "up" ? n === 0 : n === list.length - 1;
                      return (
                        <form key={dir} action={moveRecommendation}>
                          <input type="hidden" name="recommendationId" value={r.id} />
                          <input type="hidden" name="direction" value={dir} />
                          <button
                            type="submit"
                            disabled={disabled}
                            aria-label={`${r.name} ${dir === "up" ? "omhoog" : "omlaag"}`}
                            className="btn-ghost h-9 w-9 justify-center px-0 disabled:opacity-30"
                          >
                            {dir === "up" ? "↑" : "↓"}
                          </button>
                        </form>
                      );
                    })}
                    <form action={toggleRecommendationVisible}>
                      <input type="hidden" name="recommendationId" value={r.id} />
                      <SubmitButton className="btn-secondary py-1.5 text-xs">{r.archived ? "Zichtbaar maken" : "Verbergen"}</SubmitButton>
                    </form>
                  </div>
                </div>
                <details className="mt-3 border-t border-line pt-3">
                  <summary className="cursor-pointer text-sm text-bordeaux">Bewerken</summary>
                  <div className="mt-4">
                    {form(r)}
                    <form action={deleteRecommendation} className="mt-3">
                      <input type="hidden" name="recommendationId" value={r.id} />
                      <SubmitButton className="text-xs text-muted hover:text-bordeaux" confirm={`"${r.name}" verwijderen?`}>Aanrader verwijderen</SubmitButton>
                    </form>
                  </div>
                </details>
              </div>
            ))}
          </section>
        );
      })}

      <section className="card p-5">
        <h2 className="mb-3 text-xl">Nieuwe aanrader</h2>
        {form()}
      </section>
    </div>
  );
}
