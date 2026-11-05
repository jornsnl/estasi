import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteSupplierDocument, saveSupplier } from "@/app/actions/ws-portal";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { requireCouple } from "@/lib/ws/access";
import { query } from "@/lib/ws/db";
import { DOCUMENT_ACCEPT } from "@/lib/ws/files";
import { SUPPLIER_STATUS, suppliersFor } from "@/lib/ws/suppliers";
import { formatDateTime } from "@/lib/ws/format";

export const metadata = { title: "Leverancier" };

export default async function SupplierDetail({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string; categoryId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId, categoryId } = await params;
  const { couple, isAdmin } = await requireCouple(coupleId);
  if (!couple.suppliers_enabled) notFound();
  const supplier = (await suppliersFor(couple.id)).find((s) => s.category_id === categoryId);
  if (!supplier) notFound();
  const documents = supplier.id
    ? await query<{ id: string; file_id: string; name: string; size: number; created_at: Date }>(
        `select d.id, f.id as file_id, f.name, f.size, d.created_at from supplier_documents d join files f on f.id = d.file_id
          where d.supplier_id = $1 order by d.created_at`,
        [supplier.id],
      )
    : [];
  const field = (name: string, label: string, value: string, type = "text") => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} defaultValue={value} className="input" />
    </div>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <Link href={`/k/${couple.id}/leveranciers`} className="text-sm text-muted hover:text-bordeaux">← Jullie leveranciers</Link>
        <h1 className="mt-2 text-3xl">{supplier.category_name}</h1>
        <p className="mt-1 text-gold-ink">{SUPPLIER_STATUS[supplier.status]}{supplier.name ? ` · ${supplier.name}` : ""}</p>
      </header>
      <Notice searchParams={searchParams} />

      {!isAdmin && (supplier.contact_person || supplier.phone || supplier.email || supplier.website || supplier.address) && (
        <dl className="card grid gap-3 p-5 text-sm sm:grid-cols-2">
          {supplier.contact_person && <div><dt className="text-muted">Contactpersoon</dt><dd>{supplier.contact_person}</dd></div>}
          {supplier.phone && <div><dt className="text-muted">Telefoon</dt><dd><a className="text-bordeaux" href={`tel:${supplier.phone.replace(/\s/g, "")}`}>{supplier.phone}</a></dd></div>}
          {supplier.email && <div><dt className="text-muted">E-mail</dt><dd><a className="text-bordeaux" href={`mailto:${supplier.email}`}>{supplier.email}</a></dd></div>}
          {supplier.website && <div><dt className="text-muted">Website</dt><dd><a className="text-bordeaux break-all" href={supplier.website.startsWith("http") ? supplier.website : `https://${supplier.website}`} target="_blank" rel="noreferrer">{supplier.website}</a></dd></div>}
          {supplier.address && <div className="sm:col-span-2"><dt className="text-muted">Adres</dt><dd>{supplier.address}</dd></div>}
        </dl>
      )}

      <form action={saveSupplier} className="card space-y-4 p-5">
        <input type="hidden" name="coupleId" value={couple.id} />
        <input type="hidden" name="categoryId" value={supplier.category_id} />
        {isAdmin && (
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
        )}
        <div>
          <label className="label" htmlFor="notes">Notities</label>
          <textarea id="notes" name="notes" rows={5} defaultValue={supplier.notes} className="input" />
        </div>
        <div className="text-sm">
          <label className="label" htmlFor="document">Document toevoegen (offerte, contract)</label>
          <input id="document" type="file" name="document" accept={DOCUMENT_ACCEPT} />
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
                  <input type="hidden" name="categoryId" value={supplier.category_id} />
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
