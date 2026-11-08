import { mealTotal, partialCount, partialRowsIndex } from "@/lib/ws/guest-counts";
import { mealsFor } from "@/lib/ws/meals";
import { dietSummary } from "@/lib/ws/pure";

export const th = "border-b border-ink py-1 pr-2 text-left font-semibold";
export const td = "py-1 pr-2 align-top";

/** "Wie eet er mee" for print, with the "Deel van de dag" groups and per guest the meals they are there for. */
export async function MealsPrint({ coupleId }: { coupleId: string }) {
  const { moments, rows, guests, partial } = await mealsFor(coupleId);
  const active = moments.filter((m) => m.active);
  const at = partialRowsIndex(rows);
  const value = (r: (typeof rows)[number], id: string) => {
    const c = r.cells[id];
    if (!c) return "";
    if (r.kind === "person") return c.checked ? "✓" : "";
    if (r.kind === "group") return c.count ? String(c.count) : "";
    return c.checked ? String(c.count) : "–";
  };
  const rowEl = (r: (typeof rows)[number]) => (
    <tr key={r.id} className="border-b border-line">
      <td className={td}>{r.name}{r.kind === "person" && r.role ? <span className="text-muted"> ({r.role})</span> : null}</td>
      {active.map((m) => <td key={m.id} className={`${td} text-center`}>{value(r, m.id)}</td>)}
      <td className={td}>{r.kind === "rsvp" ? r.summary : r.diet}</td>
    </tr>
  );
  const partialEls = ([[false, "Deel van de dag, volwassenen"], [true, "Deel van de dag, kinderen"]] as const).map(([kids, label]) => {
    const list = partial.filter((g) => g.is_kid === kids);
    return [
      <tr key={label} className="border-b border-line">
        <td className={td}>{label}</td>
        {active.map((m) => <td key={m.id} className={`${td} text-center`}>{partialCount(guests, kids, m.id)}</td>)}
        <td className={td}>{dietSummary(list.map((g) => g.diet))}</td>
      </tr>,
      ...list.map((g) => (
        <tr key={g.id} className="border-b border-line/60 text-[11px] text-muted">
          <td className={`${td} pl-4`}>{g.name}{g.partial_note ? ` (${g.partial_note})` : ""}</td>
          {active.map((m) => <td key={m.id} className={`${td} text-center`}>{g.excluded.includes(m.id) ? "" : "✓"}</td>)}
          <td className={td}>{g.diet}</td>
        </tr>
      )),
    ];
  });
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className={th}>Wie eet er mee</th>
          {active.map((m) => <th key={m.id} className={`${th} text-center`}>{m.name}{m.at_time ? <span className="block text-[10px] font-normal">{m.at_time}</span> : null}</th>)}
          <th className={th}>Allergieën / dieetwensen</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, at).map(rowEl)}
        {partialEls}
        {rows.slice(at).map(rowEl)}
        <tr className="border-t-2 border-ink font-semibold">
          <td className={td}>Totaal</td>
          {active.map((m) => <td key={m.id} className={`${td} text-center`}>{mealTotal(rows, guests, m.id)}</td>)}
          <td />
        </tr>
      </tbody>
    </table>
  );
}
