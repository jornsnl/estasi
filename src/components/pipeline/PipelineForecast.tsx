import { DEFAULT_STAGE_PROBABILITY, STAGE_COLORS, STAGE_LABELS, forecast, type ForecastLead } from "@/lib/pipeline/rules";
import { formatMoney } from "@/lib/ws/format";

/**
 * Forecast at the top of the pipeline: per open stage the sum of value × chance.
 * A lead without an own chance counts with the default chance of its stage.
 */
export function PipelineForecast({ leads }: { leads: ForecastLead[] }) {
  const f = forecast(leads);
  if (!f.rows.some((r) => r.count > 0)) return null;
  const defaulted = f.rows.reduce((s, r) => s + r.defaulted, 0);

  return (
    <section aria-label="Forecast" className="card space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">Forecast</p>
        <p className="text-sm text-muted">
          <span className="font-serif text-2xl text-bordeaux">{formatMoney(f.weighted)}</span> verwacht van {formatMoney(f.value)} open
        </p>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-line sm:grid-cols-4">
        {f.rows.map((r) => (
          <div key={r.stage} className="space-y-0.5 bg-white p-3">
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STAGE_COLORS[r.stage] }} />
              {STAGE_LABELS[r.stage]}
            </p>
            <p className="text-sm tabular-nums">{r.weighted > 0 ? formatMoney(r.weighted) : "–"}</p>
            <p className="text-[11px] tabular-nums text-muted">
              {r.count} {r.count === 1 ? "lead" : "leads"}
              {r.value > 0 && <> · {formatMoney(r.value)}</>}
            </p>
          </div>
        ))}
      </div>
      {(defaulted > 0 || f.withoutValue > 0) && (
        <p className="text-[11px] leading-relaxed text-muted">
          {defaulted > 0 && (
            <>
              {defaulted} {defaulted === 1 ? "lead heeft" : "leads hebben"} nog geen eigen kans; daar geldt de standaard (
              {f.rows.map((r) => `${STAGE_LABELS[r.stage].toLowerCase()} ${DEFAULT_STAGE_PROBABILITY[r.stage]}%`).join(", ")}).{" "}
            </>
          )}
          {f.withoutValue > 0 && (
            <>
              {f.withoutValue} {f.withoutValue === 1 ? "lead heeft" : "leads hebben"} nog geen verwachte waarde.
            </>
          )}
        </p>
      )}
    </section>
  );
}
