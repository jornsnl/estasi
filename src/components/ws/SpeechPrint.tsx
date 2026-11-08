import type { Speech } from "@/lib/ws/speeches";
import { formatMinutes, momentLabel, needsOf, needsSummary, totalMinutes } from "@/lib/ws/speeches-pure";

const th = "border-b border-ink py-1 pr-2 text-left font-semibold";
const td = "py-1 pr-2 align-top";

/**
 * The compact speech list: the speech print page and the chapter in the run
 * sheet print (Sabine only). The caller loads the speeches, through
 * speechesFor, which checks the owner role.
 */
export function SpeechPrintTable({ speeches }: { speeches: Speech[] }) {
  const minutes = totalMinutes(speeches);
  const needs = needsSummary(speeches);
  if (speeches.length === 0) return <p className="text-sm text-muted">Nog geen speeches.</p>;
  return (
    <div className="space-y-3">
      <table className="w-full table-fixed border-collapse break-words text-[11px]">
        <colgroup>
          <col className="w-[5%]" />
          <col className="w-[8%]" />
          <col className="w-[17%]" />
          <col className="w-[15%]" />
          <col className="w-[14%]" />
          <col className="w-[7%]" />
          <col className="w-[20%]" />
          <col className="w-[14%]" />
        </colgroup>
        <thead>
          <tr>{["Nr.", "Tijd", "Spreker", "Relatie", "Moment", "Duur", "Benodigdheden", "Telefoon"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {speeches.map((s, i) => (
            <tr key={s.id} className="border-b border-line">
              <td className={td}>{i + 1}</td>
              <td className={`${td} whitespace-nowrap`}>{s.planned_time}</td>
              <td className={td}>{s.speaker_name}{s.surprise ? " (verrassing)" : ""}</td>
              <td className={td}>{s.relation}</td>
              <td className={td}>{momentLabel(s)}</td>
              <td className={`${td} whitespace-nowrap`}>{s.duration_minutes != null ? `${s.duration_minutes} min` : ""}</td>
              <td className={td}>{needsOf(s).join(", ")}</td>
              <td className={`${td} whitespace-nowrap`}>{s.phone}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="break-inside-avoid text-[11px]">
        <h3 className="mb-0.5 text-sm font-semibold">Totaaloverzicht</h3>
        <p>{speeches.length} {speeches.length === 1 ? "speech" : "speeches"} · totale duur {formatMinutes(minutes)}</p>
        <p>Benodigdheden: {needs || "geen"}</p>
      </div>
    </div>
  );
}
