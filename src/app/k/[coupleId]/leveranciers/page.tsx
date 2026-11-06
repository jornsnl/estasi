import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlanning } from "@/lib/ws/access";
import { SUPPLIER_STATUS, suppliersFor } from "@/lib/ws/suppliers";

export const metadata = { title: "Jullie leveranciers" };

export default async function SuppliersPage({ params }: { params: Promise<{ coupleId: string }> }) {
  const { coupleId } = await params;
  const { couple } = await requirePlanning(coupleId);
  if (!couple.suppliers_enabled) notFound();
  const rows = await suppliersFor(couple.id);

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Onderdeel</p>
        <h1 className="mt-1 text-3xl">Jullie leveranciers</h1>
        <p className="mt-1 text-sm text-muted">Klik op een categorie voor contactgegevens, notities en documenten zoals offertes.</p>
      </header>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="table-head"><tr><th className="px-4 py-2.5">Categorie</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Leverancier</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.category_id} className="border-t border-line hover:bg-cream/50">
                <td className="px-4 py-3">
                  <Link href={`/k/${couple.id}/leveranciers/${s.category_id}`} className="font-medium hover:text-bordeaux">{s.category_name}</Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${s.status === "booked" ? "bg-success-soft text-success" : s.status === "talking" ? "bg-[#f3eedb] text-gold-ink" : "bg-cream text-muted"}`}>
                    {SUPPLIER_STATUS[s.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">
                  {s.name || "–"}
                  {s.documents > 0 && <span className="ml-2 text-xs">· {s.documents} document{s.documents === 1 ? "" : "en"}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Sabine&apos;s aanraders per categorie volgen binnenkort.</p>
    </div>
  );
}
