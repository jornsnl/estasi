export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div>
      {label && (
        <div className="mb-1.5 flex justify-between text-sm">
          <span className="text-muted">{label}</span>
          <span className="font-medium text-ink">{value}%</span>
        </div>
      )}
      <div
        className="h-2 overflow-hidden rounded-full bg-gold-soft"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Voortgang"}
      >
        <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
