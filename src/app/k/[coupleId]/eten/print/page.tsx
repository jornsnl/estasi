import { AutoPrint } from "@/components/AutoPrint";
import { requirePlanning } from "@/lib/ws/access";
import { allergyList } from "@/lib/ws/allergies";
import { coupleName, formatDate } from "@/lib/ws/format";
import { mealsFor } from "@/lib/ws/meals";
import { MealsPrint, td, th } from "./MealsPrint";

export const metadata = { title: "Eten en allergieën" };

/** The meals and the allergy list as a PDF for the caterer. */
export default async function AllergyPrint({ params, searchParams }: { params: Promise<{ coupleId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { coupleId } = await params;
  const { couple } = await requirePlanning(coupleId);
  const { guests, rows } = await mealsFor(couple.id);
  const list = allergyList(guests, rows);
  return (
    <div className="print-sheet space-y-6 bg-white p-6 text-sm">
      {(await searchParams).print === "1" && <AutoPrint />}
      <div>
        <h1 className="text-2xl">Eten en allergieën</h1>
        <p className="text-muted">Bruiloft {coupleName(couple)}{couple.wedding_date ? `, ${formatDate(couple.wedding_date)}` : ""}{couple.location ? `, ${couple.location}` : ""}</p>
      </div>
      <section>
        <h2 className="mb-1 text-lg">Wie eet er mee</h2>
        <MealsPrint coupleId={couple.id} />
      </section>
      <section>
        <h2 className="mb-1 text-lg">Allergieën en dieetwensen</h2>
        <table className="w-full border-collapse">
          <thead><tr>{["Naam", "Groep", "Allergie / dieetwens"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>
            {list.map((a, i) => (
              <tr key={i} className="border-b border-line"><td className={td}>{a.name}{a.kid ? " (kind)" : ""}</td><td className={td}>{a.group}</td><td className={td}>{a.diet}</td></tr>
            ))}
            {list.length === 0 && <tr><td colSpan={3} className={`${td} text-muted`}>Nog geen allergieën of dieetwensen.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
