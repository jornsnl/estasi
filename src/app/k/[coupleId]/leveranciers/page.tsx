import { notFound } from "next/navigation";
import { addCoupleCategory } from "@/app/actions/ws-suppliers";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { RecommendationBar, SupplierTable } from "@/components/ws/SupplierTable";
import { requirePlanning } from "@/lib/ws/access";
import { suppliersFor, visibleRecommendationCounts } from "@/lib/ws/suppliers";

export const metadata = { title: "Jullie leveranciers" };

export default async function SuppliersPage({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple } = await requirePlanning(coupleId);
  if (!couple.suppliers_enabled) notFound();
  const [rows, recommendations] = await Promise.all([suppliersFor(couple.id), visibleRecommendationCounts()]);

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Onderdeel</p>
        <h1 className="mt-1 text-3xl">Jullie leveranciers</h1>
        <p className="mt-1 text-sm text-muted">Vul per categorie in wie het wordt; alles wordt meteen opgeslagen.</p>
      </header>
      {/* Feedback: the bordeaux bar right under the title, above the first category (Locatie), instead of under one category. */}
      {Object.values(recommendations).some((n) => n > 0) && <RecommendationBar href={`/k/${couple.id}/leveranciers/aanraders`} />}
      <Notice searchParams={searchParams} />
      <SupplierTable
        coupleId={couple.id}
        rows={rows.map((r) => ({
          id: r.id,
          category_id: r.category_id,
          category_name: r.category_name,
          category_own: r.category_couple_id !== null,
          status: r.status,
          name: r.name,
          contact_person: r.contact_person,
          phone: r.phone,
          email: r.email,
          notes: r.notes,
          present_from: r.present_from,
          present_until: r.present_until,
          documents: r.documents,
          eats_along: r.eats_along,
        }))}
      />
      <form action={addCoupleCategory} className="card flex flex-wrap items-end gap-2 p-4">
        <input type="hidden" name="coupleId" value={couple.id} />
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="newCategory">Eigen categorie toevoegen</label>
          <input id="newCategory" name="name" required maxLength={80} placeholder="Bijvoorbeeld: Fotobooth" className="input" />
        </div>
        <SubmitButton className="btn-secondary">Toevoegen</SubmitButton>
      </form>
    </div>
  );
}
