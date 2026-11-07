import { addDocument, deleteDocument, replaceDocument } from "@/app/actions/ws-docs";
import { SubmitButton } from "@/components/SubmitButton";
import { FileUpload } from "@/components/ws/FileUpload";
import { query } from "@/lib/ws/db";
import { directUploads } from "@/lib/ws/files";
import { formatDate } from "@/lib/ws/format";
import { formatBytes } from "@/lib/ws/upload-rules";

interface DocRow {
  id: string;
  couple_id: string | null;
  title: string;
  file_id: string;
  file_name: string;
  size: number;
  updated_at: Date;
}

/**
 * The document list of "Jullie pakket" (fixed documents for every couple plus
 * this couple's extra ones) or "Facturen & Offertes" (this couple only).
 */
export async function DocumentsSection({
  coupleId,
  section,
  isAdmin,
  empty,
}: {
  coupleId: string;
  section: "package" | "invoices";
  isAdmin: boolean;
  empty: string;
}) {
  const docs = await query<DocRow>(
    `select d.id, d.couple_id, d.title, d.file_id, f.name as file_name, f.size, d.updated_at
       from documents d join files f on f.id = d.file_id
      where d.section = $2 and (d.couple_id = $1 or (d.couple_id is null and $2 = 'package'))
      order by d.couple_id nulls first, d.position, d.created_at`,
    [coupleId, section],
  );
  const direct = directUploads();
  const hidden = (
    <>
      <input type="hidden" name="coupleId" value={coupleId} />
      <input type="hidden" name="section" value={section} />
    </>
  );

  return (
    <div className="space-y-4">
      {docs.length === 0 && <p className="card p-5 text-sm text-muted">{empty}</p>}
      {docs.length > 0 && (
        <ul className="card divide-y divide-line">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div className="min-w-0">
                <a href={`/api/ws-bestanden/${d.file_id}`} className="font-medium text-bordeaux underline-offset-2 hover:underline">{d.title}</a>
                <p className="text-xs text-muted">
                  {d.file_name} · {formatBytes(d.size)} · geüpload {formatDate(d.updated_at)}
                  {isAdmin && d.couple_id === null ? " · vast document, bij alle bruidsparen" : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <a href={`/api/ws-bestanden/${d.file_id}`} download className="btn-secondary py-1.5 text-xs">Downloaden</a>
                {isAdmin && (
                  <>
                    <details className="relative">
                      <summary className="cursor-pointer text-xs text-bordeaux">Nieuwe versie</summary>
                      <form action={replaceDocument} className="absolute right-0 z-10 mt-2 w-72 space-y-2 rounded-xl bg-white p-3 shadow-lg">
                        {hidden}
                        <input type="hidden" name="documentId" value={d.id} />
                        <FileUpload name="file" coupleId={coupleId} kind="document" direct={direct} required />
                        <SubmitButton className="btn-primary py-1.5 text-xs" pendingText="Opslaan…">Vervangen</SubmitButton>
                      </form>
                    </details>
                    <form action={deleteDocument}>
                      {hidden}
                      <input type="hidden" name="documentId" value={d.id} />
                      <SubmitButton
                        className="text-xs text-muted hover:text-bordeaux"
                        confirm={d.couple_id === null ? `"${d.title}" verwijderen bij alle bruidsparen?` : `"${d.title}" verwijderen?`}
                      >
                        Verwijderen
                      </SubmitButton>
                    </form>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <form action={addDocument} className="card space-y-3 p-5">
          {hidden}
          <h3 className="font-serif text-lg font-semibold">Document uploaden</h3>
          <div>
            <label className="label" htmlFor={`title-${section}`}>Naam (optioneel)</label>
            <input id={`title-${section}`} name="title" maxLength={200} placeholder="Bijvoorbeeld: Checklist bruiloft" className="input" />
          </div>
          {section === "package" && (
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="label">Voor wie</legend>
              <label className="flex items-center gap-2"><input type="radio" name="scope" value="couple" defaultChecked className="accent-[#6B1E2E]" /> Dit bruidspaar</label>
              <label className="flex items-center gap-2"><input type="radio" name="scope" value="all" className="accent-[#6B1E2E]" /> Alle bruidsparen (vast document)</label>
            </fieldset>
          )}
          <FileUpload name="file" coupleId={coupleId} kind="document" direct={direct} required />
          <SubmitButton className="btn-primary" pendingText="Uploaden…">Document toevoegen</SubmitButton>
        </form>
      )}
    </div>
  );
}
