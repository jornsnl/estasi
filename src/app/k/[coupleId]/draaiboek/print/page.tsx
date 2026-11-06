import Link from "next/link";
import { PrintButton } from "@/components/PrintButton";
import { requirePlanning } from "@/lib/ws/access";
import { coupleName, formatDate } from "@/lib/ws/format";
import { rowsFor, sortSchedule, supplierContacts, tabsFor } from "@/lib/ws/runsheet";

export const metadata = { title: "Draaiboek (print)" };

/** Compact print version: every tab as a tight table, no spreadsheet export. */
export default async function RunSheetPrint({ params }: { params: Promise<{ coupleId: string }> }) {
  const { coupleId } = await params;
  const { couple } = await requirePlanning(coupleId);
  const [tabs, rows, suppliers] = await Promise.all([tabsFor(couple.id), rowsFor(couple.id), supplierContacts(couple.id)]);
  const guests = [
    couple.guests_day !== null ? `${couple.guests_day} overdag${couple.guests_day_kids ? ` (${couple.guests_day_kids} kinderen)` : ""}` : null,
    couple.guests_evening !== null ? `${couple.guests_evening} 's avonds` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-5 bg-white p-4 text-[12px] leading-snug print:p-0">
      <div className="no-print flex gap-2">
        <Link href={`/k/${couple.id}/draaiboek`} className="btn-secondary">← Terug</Link>
        <PrintButton label="Printen of opslaan als pdf" />
      </div>
      <header>
        <h1 className="text-2xl">Draaiboek {coupleName(couple)}</h1>
        <p className="text-muted">{formatDate(couple.wedding_date)}{couple.location ? ` · ${couple.location}` : ""}{guests.length ? ` · ${guests.join(" · ")}` : ""}</p>
      </header>
      {tabs.map((tab) => {
        const tabRows = tab.kind === "schedule" ? sortSchedule(rows.filter((r) => r.tab_id === tab.id)) : rows.filter((r) => r.tab_id === tab.id);
        if (tabRows.length === 0) return null;
        return (
          <section key={tab.id} className="break-inside-avoid-page">
            <h2 className="mb-1 text-base">{tab.title}</h2>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-ink text-left">
                  {tab.kind === "schedule" ? ["Tijd", "Wie", "Wat", "Meer info", "Waar", "Waar (regen)"].map((h) => <th key={h} className="py-1 pr-2 font-semibold">{h}</th>) : ["Wat", "Wie", "Meer info"].map((h) => <th key={h} className="py-1 pr-2 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {tabRows.map((r) => (
                  <tr key={r.id} className="border-b border-line align-top">
                    {tab.kind === "schedule" ? (
                      <>
                        <td className="py-1 pr-2 whitespace-nowrap">{r.at_time}</td><td className="py-1 pr-2">{r.who}</td><td className="py-1 pr-2">{r.what}</td>
                        <td className="py-1 pr-2">{r.info}</td><td className="py-1 pr-2">{r.location}</td><td className="py-1 pr-2">{r.rain_location}</td>
                      </>
                    ) : (
                      <><td className="py-1 pr-2">{r.what}</td><td className="py-1 pr-2">{r.who}</td><td className="py-1 pr-2">{r.info}</td></>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      {suppliers.length > 0 && (
        <section className="break-inside-avoid-page">
          <h2 className="mb-1 text-base">Leveranciers</h2>
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-ink text-left">{["Categorie", "Leverancier", "Contact", "Telefoon", "E-mail"].map((h) => <th key={h} className="py-1 pr-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.category_id} className="border-b border-line"><td className="py-1 pr-2">{s.category_name}</td><td className="py-1 pr-2">{s.name}</td><td className="py-1 pr-2">{s.contact_person}</td><td className="py-1 pr-2">{s.phone}</td><td className="py-1 pr-2">{s.email}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
