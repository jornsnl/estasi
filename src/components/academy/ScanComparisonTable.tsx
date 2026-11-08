import type { ScanComparison } from "@/lib/domain/assignment";

/** First and repeated measurement side by side (competence scan). */
export function ScanComparisonTable({ comparison, beforeLabel = "Begin", afterLabel = "Nu" }: { comparison: ScanComparison[]; beforeLabel?: string; afterLabel?: string }) {
  return (
    <div className="mt-3 space-y-4">
      {comparison.map((c) => (
        <div key={c.fieldId} className="overflow-x-auto">
          {comparison.length > 1 && c.label && <p className="mb-1 text-sm font-medium">{c.label}</p>}
          <table className="w-full min-w-[20rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="py-2 pr-3 font-medium">Onderwerp</th>
                <th className="w-20 py-2 pr-3 text-center font-medium">{beforeLabel}</th>
                <th className="w-20 py-2 pr-3 text-center font-medium">{afterLabel}</th>
                <th className="w-20 py-2 text-center font-medium">Verschil</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r, i) => (
                <tr key={`${r.label}-${i}`} className="border-b border-line/60">
                  <td className="py-2 pr-3">{r.label}</td>
                  <td className="py-2 pr-3 text-center">{r.before ?? "–"}</td>
                  <td className="py-2 pr-3 text-center">{r.after ?? "–"}</td>
                  <td className={`py-2 text-center ${r.change && r.change > 0 ? "text-success" : r.change && r.change < 0 ? "text-bordeaux" : "text-muted"}`}>
                    {r.change === null ? "" : r.change > 0 ? `+${r.change}` : r.change}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
