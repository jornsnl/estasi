import { deleteRecommendation, saveRecommendation } from "@/app/actions/ws-suppliers";
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
         from recommendations r order by r.position, r.name`,
    ),
  ]);
  const direct = directUploads();

  const form = (r?: Recommendation) => (
    <form action={saveRecommendation} className="grid gap-3 sm:grid-cols-2">
      {r && <input type="hidden" name="recommendationId" value={r.id} />}
      <div>
        <label className="label" htmlFor={`cat-${r?.id ?? "new"}`}>Categorie</label>
        <select id={`cat-${r?.id ?? "new"}`} name="categoryId" required defaultValue={r?.category_id ?? ""} className="input">
          <option value="" disabled>Kies een categorie</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div><label className="label" htmlFor={`n-${r?.id ?? "new"}`}>Bedrijfsnaam</label><input id={`n-${r?.id ?? "new"}`} name="name" required defaultValue={r?.name} className="input" /></div>
      <div><label className="label" htmlFor={`p-${r?.id ?? "new"}`}>Beroep</label><input id={`p-${r?.id ?? "new"}`} name="profession" defaultValue={r?.profession} placeholder="Bijvoorbeeld: Bruidsfotograaf" className="input" /></div>
      <div><label className="label" htmlFor={`t-${r?.id ?? "new"}`}>Telefoon</label><input id={`t-${r?.id ?? "new"}`} name="phone" type="tel" defaultValue={r?.phone} className="input" /></div>
      <div><label className="label" htmlFor={`e-${r?.id ?? "new"}`}>E-mail</label><input id={`e-${r?.id ?? "new"}`} name="email" type="email" defaultValue={r?.email} className="input" /></div>
      <div><label className="label" htmlFor={`w-${r?.id ?? "new"}`}>Website</label><input id={`w-${r?.id ?? "new"}`} name="website" defaultValue={r?.website} className="input" /></div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`x-${r?.id ?? "new"}`}>Ervaring van Sabine</label>
        <AutoTextarea id={`x-${r?.id ?? "new"}`} name="experience" defaultValue={r?.experience} className="input min-h-20" />
      </div>
      <div className="text-sm">
        <p className="label">Foto</p>
        <FileUpload name="photo" coupleId={null} kind="image" direct={direct} label={r?.photo_file_id ? "Andere foto" : "Foto uploaden"} />
        {r?.photo_file_id && <label className="mt-1 flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="removePhoto" /> Foto verwijderen</label>}
      </div>
      <div className="text-sm">
        <p className="label">Brochure</p>
        <FileUpload name="brochure" coupleId={null} kind="document" direct={direct} label={r?.brochure_file_id ? "Andere brochure" : "Brochure uploaden"} />
        {r?.brochure_file_id && <label className="mt-1 flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="removeBrochure" /> Brochure verwijderen</label>}
      </div>
      <div className="sm:col-span-2"><SubmitButton className="btn-primary" pendingText="Opslaan…">{r ? "Opslaan" : "Aanrader toevoegen"}</SubmitButton></div>
    </form>
  );

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <p className="eyebrow">Beheer</p>
        <h1 className="mt-1 text-3xl">Aanraders leveranciers</h1>
        <p className="mt-1 text-sm text-muted">
          Bruidsparen met een Weddingplanner- of Ceremoniemeesterpakket zien deze leveranciers per categorie. Een nieuwe favoriet zie je op je dashboard en per mail.
        </p>
      </header>
      <Notice searchParams={searchParams} />

      {categories.map((c) => {
        const list = recs.filter((r) => r.category_id === c.id);
        if (list.length === 0) return null;
        return (
          <section key={c.id} className="space-y-2">
            <h2 className="section-title">{c.name}</h2>
            {list.map((r) => (
              <details key={r.id} id={`r-${r.id}`} className="card scroll-mt-6 p-4">
                <summary className="flex cursor-pointer items-center gap-3">
                  {r.photo_file_id ? (
                    // eslint-disable-next-line @next/next/no-img-element -- photo behind a login check
                    <img src={`/api/ws-bestanden/${r.photo_file_id}`} alt="" className="h-12 w-12 rounded-xl object-cover" />
                  ) : (
                    <span className="h-12 w-12 rounded-xl bg-cream-deep" />
                  )}
                  <span className="flex-1">
                    <span className="block font-medium">{r.name}</span>
                    <span className="text-xs text-muted">{r.profession}{r.favorites ? ` · ${r.favorites}× gekozen` : ""}</span>
                  </span>
                </summary>
                <div className="mt-4 border-t border-line pt-4">
                  {form(r)}
                  <form action={deleteRecommendation} className="mt-3">
                    <input type="hidden" name="recommendationId" value={r.id} />
                    <SubmitButton className="text-xs text-muted hover:text-bordeaux" confirm={`"${r.name}" verwijderen?`}>Aanrader verwijderen</SubmitButton>
                  </form>
                </div>
              </details>
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
