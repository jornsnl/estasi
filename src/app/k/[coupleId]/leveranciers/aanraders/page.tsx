import Link from "next/link";
import { notFound } from "next/navigation";
import { CategorySelect, RecommendationGrid } from "@/components/ws/RecommendationGrid";
import { recommendationCount } from "@/lib/ws/recommendations";
import { requirePlanning } from "@/lib/ws/access";
import { isUuid, query } from "@/lib/ws/db";
import type { Recommendation } from "@/lib/ws/types";

export const metadata = { title: "Aanraders van Estasi" };

export default async function RecommendationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple } = await requirePlanning(coupleId);
  if (!couple.suppliers_enabled) notFound();
  const categories = await query<{ id: string; name: string; count: number }>(
    `select c.id, c.name, count(r.id)::int as count from supplier_categories c
       join recommendations r on r.category_id = c.id and not r.archived
      where not c.archived and c.couple_id is null
      group by c.id order by c.position, c.name`,
  );
  const wanted = String((await searchParams).categorie ?? "");
  const current = categories.find((c) => c.id === wanted) ?? categories[0];
  const [items, favorites] = current && isUuid(current.id)
    ? await Promise.all([
        query<Recommendation>("select * from recommendations where category_id = $1 and not archived order by position, name, id", [current.id]),
        query<{ recommendation_id: string }>(
          "select recommendation_id from couple_suppliers where couple_id = $1 and recommendation_id is not null",
          [couple.id],
        ),
      ])
    : [[], []];
  const base = `/k/${couple.id}/leveranciers/aanraders`;

  return (
    <div className="space-y-6">
      <header>
        <Link href={`/k/${couple.id}/leveranciers`} className="text-sm text-muted hover:text-bordeaux">← Jullie leveranciers</Link>
        <h1 className="mt-2 text-3xl">Aanraders van Estasi</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Dit zijn leveranciers met wie ik met plezier samenwerk en die ik met een gerust hart aanraad. Kies hieronder wat je zoekt en ontdek wie er bij jullie dag past.
        </p>
      </header>
      {categories.length > 0 && current && (
        <div className="space-y-1">
          <label htmlFor="aanrader-categorie" className="label">Wat voor leverancier zoeken jullie?</label>
          <CategorySelect id="aanrader-categorie" base={base} categories={categories} current={current.id} />
          <p className="text-sm text-muted" aria-live="polite">{recommendationCount(items.length, current.name)}</p>
        </div>
      )}
      {items.length === 0 ? (
        <p className="card p-5 text-sm text-muted">Er staan in deze categorie nog geen aanraders.</p>
      ) : (
        <RecommendationGrid
          key={current?.id}
          coupleId={couple.id}
          favorites={favorites.map((f) => f.recommendation_id)}
          items={items.map((r) => ({
            id: r.id,
            name: r.name,
            profession: r.profession,
            region: r.region,
            contactPerson: r.contact_person,
            phone: r.phone,
            email: r.email,
            website: r.website,
            instagram: r.instagram,
            description: r.description,
            workArea: r.work_area,
            priceIndication: r.price_indication,
            availability: r.availability,
            experience: r.experience,
            photo: r.photo_file_id ? `/api/ws-bestanden/${r.photo_file_id}` : null,
            brochure: r.brochure_file_id ? `/api/ws-bestanden/${r.brochure_file_id}` : null,
          }))}
        />
      )}
    </div>
  );
}
