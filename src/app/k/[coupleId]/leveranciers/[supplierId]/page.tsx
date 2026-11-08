import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteSupplierDocument, saveSupplierDetails } from "@/app/actions/ws-suppliers";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { AutoTextarea } from "@/components/ws/AutoTextarea";
import { FileUpload } from "@/components/ws/FileUpload";
import { requirePlanning } from "@/lib/ws/access";
import { isUuid, query } from "@/lib/ws/db";
import { directUploads } from "@/lib/ws/files";
import { formatDateTime } from "@/lib/ws/format";
import { RecommendationBar } from "@/components/ws/SupplierTable";
import { SHOWS_RECOMMENDATIONS, SUPPLIER_STATUS, suppliersFor, visibleRecommendationCounts } from "@/lib/ws/suppliers";

export const metadata = { title: "Leverancier" };

export default async function SupplierDetail({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string; supplierId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId, supplierId } = await params;
  const { couple } = await requirePlanning(coupleId);
  if (!couple.suppliers_enabled || !isUuid(supplierId)) notFound();
  const [suppliers, recommendations] = await Promise.all([suppliersFor(couple.id), visibleRecommendationCounts()]);
  const supplier = suppliers.find((s) => s.id === supplierId);
  if (!supplier) notFound();
  const documents = await query<{ id: string; file_id: string; name: string; created_at: Date }>(
    `select d.id, f.id as file_id, f.name, d.created_at from supplier_documents d join files f on f.id = d.file_id
      where d.supplier_id = $1 order by d.created_at`,
    [supplier.id],
  );
  const field = (name: string, label: string, value: string, type = "text") => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} defaultValue={value} className="input" />
    </div>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <Link href={`/k/${couple.id}/leveranciers#c-${supplier.category_id}`} className="text-sm text-muted hover:text-bordeaux">← Jullie leveranciers</Link>
        <h1 className="mt-2 text-3xl">{supplier.category_name}</h1>
        <p className="mt-1 text-gold-ink">{SUPPLIER_STATUS[supplier.status]}{supplier.name ? ` · ${supplier.name}` : ""}</p>
        {SHOWS_RECOMMENDATIONS.includes(supplier.status) && (recommendations[supplier.category_id] ?? 0) > 0 && (
          <div className="mt-3">
            <RecommendationBar href={`/k/${couple.id}/leveranciers/aanraders?categorie=${supplier.category_id}`} />
          </div>
        )}
      </header>
      <Notice searchParams={searchParams} />

      <form action={saveSupplierDetails} className="card space-y-4 p-5">
        <input type="hidden" name="coupleId" value={couple.id} />
        <input type="hidden" name="supplierId" value={supplier.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={supplier.status} className="input">
              {Object.entries(SUPPLIER_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {field("name", "Leverancier", supplier.name)}
          {field("contactPerson", "Contactpersoon", supplier.contact_person)}
          {field("phone", "Telefoon", supplier.phone, "tel")}
          {field("email", "E-mail", supplier.email, "email")}
          {field("website", "Website", supplier.website)}
          <div className="sm:col-span-2">{field("address", "Adres", supplier.address)}</div>
        </div>
        <div>
          <label className="label" htmlFor="notes">Opmerkingen</label>
          <AutoTextarea id="notes" name="notes" defaultValue={supplier.notes} className="input min-h-24" />
        </div>
        <div className="text-sm">
          <label className="label" htmlFor="document">Document toevoegen (offerte, contract)</label>
          <FileUpload id="document" name="document" coupleId={couple.id} kind="document" direct={directUploads()} />
        </div>
        <SubmitButton className="btn-primary" pendingText="Opslaan…">Opslaan</SubmitButton>
      </form>

      <section className="card p-5">
        <h2 className="mb-2 text-lg">Documenten</h2>
        {documents.length === 0 && <p className="text-sm text-muted">Nog geen documenten.</p>}
        <ul className="divide-y divide-line text-sm">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2">
              <a href={`/api/ws-bestanden/${d.file_id}`} className="text-bordeaux underline">{d.name}</a>
              <span className="flex items-center gap-3 text-xs text-muted">
                {formatDateTime(d.created_at)}
                <form action={deleteSupplierDocument}>
                  <input type="hidden" name="coupleId" value={couple.id} />
                  <input type="hidden" name="supplierId" value={supplier.id} />
                  <input type="hidden" name="documentId" value={d.id} />
                  <SubmitButton className="hover:text-bordeaux" confirm={`"${d.name}" verwijderen?`}>Verwijderen</SubmitButton>
                </form>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
