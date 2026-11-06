import Link from "next/link";
import { notFound } from "next/navigation";
import { CategorySelect, RecommendationGrid } from "@/components/ws/RecommendationGrid";
import { requirePlanning } from "@/lib/ws/access";
import { isUuid, query } from "@/lib/ws/db";
import type { Recommendation } from "@/lib/ws/types";

export const metadata = { title: "Aanraders leveranciers" };

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
        query<Recommendation>("select * from recommendations where category_id = $1 and not archived order by position, name", [current.id]),
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
        <h1 className="mt-2 text-3xl">Aanraders leveranciers</h1>
        <p className="mt-1 text-sm text-muted">
          Leveranciers waar Sabine graag mee samenwerkt. Klik op een leverancier voor de gegevens en haar ervaring. Met het hartje komt hij bij Jullie leveranciers als &quot;Huidige favoriet&quot;.
        </p>
      </header>
      {categories.length === 0 ? (
        <p className="card p-5 text-sm text-muted">Sabine zet hier binnenkort haar aanraders neer.</p>
      ) : (
        <>
          <CategorySelect base={base} categories={categories} current={current?.id ?? ""} />
          <RecommendationGrid
            key={current?.id}
            coupleId={couple.id}
            favorites={favorites.map((f) => f.recommendation_id)}
            items={items.map((r) => ({
              id: r.id,
              name: r.name,
              profession: r.profession,
              phone: r.phone,
              email: r.email,
              website: r.website,
              experience: r.experience,
              photo: r.photo_file_id ? `/api/ws-bestanden/${r.photo_file_id}` : null,
              brochure: r.brochure_file_id ? `/api/ws-bestanden/${r.brochure_file_id}` : null,
            }))}
          />
        </>
      )}
    </div>
  );
}
