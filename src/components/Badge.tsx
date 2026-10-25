const tones = {
  neutral: "bg-cream text-muted border-line",
  gold: "bg-gold-soft text-gold-ink border-gold/30",
  bordeaux: "bg-bordeaux-soft text-bordeaux border-bordeaux/20",
  success: "bg-success-soft text-success border-success/20",
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof tones; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
