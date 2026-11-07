import { AutoPrint } from "@/components/AutoPrint";
import { requirePlanning } from "@/lib/ws/access";
import { allergyList } from "@/lib/ws/allergies";
import { coupleName, formatDate } from "@/lib/ws/format";
import { mealsFor } from "@/lib/ws/meals";

export const metadata = { title: "Allergieën en dieetwensen" };

/** The allergy list as a PDF for the caterer. */
export default async function AllergyPrint({ params, searchParams }: { params: Promise<{ coupleId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { coupleId } = await params;
  const { couple } = await requirePlanning(coupleId);
  const { guests, rows } = await mealsFor(couple.id);
  const list = allergyList(guests, rows);
  return (
    <div className="print-sheet bg-white p-6 text-sm">
      {(await searchParams).print === "1" && <AutoPrint />}
      <h1 className="text-2xl">Allergieën en dieetwensen</h1>
      <p className="mb-4 text-muted">Bruiloft {coupleName(couple)}{couple.wedding_date ? `, ${formatDate(couple.wedding_date)}` : ""}{couple.location ? `, ${couple.location}` : ""}</p>
      <table className="w-full border-collapse">
        <thead><tr>{["Naam", "Groep", "Allergie / dieetwens"].map((h) => <th key={h} className="border-b border-ink py-1 pr-2 text-left">{h}</th>)}</tr></thead>
        <tbody>
          {list.map((a, i) => (
            <tr key={i} className="border-b border-line"><td className="py-1 pr-2">{a.name}{a.kid ? " (kind)" : ""}</td><td className="py-1 pr-2">{a.group}</td><td className="py-1 pr-2">{a.diet}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
