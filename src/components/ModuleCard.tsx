import Link from "next/link";
import type { ModuleProgress } from "@/lib/domain/progress";
import { Badge } from "./Badge";

const STATE_LABEL = { locked: "Vergrendeld", open: "Beschikbaar", completed: "Afgerond" } as const;
const STATE_TONE = { locked: "neutral", open: "gold", completed: "success" } as const;

export function ModuleCard({ p, index, href }: { p: ModuleProgress; index: number; href?: string }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="eyebrow">Module {index + 1}</span>
        <Badge tone={STATE_TONE[p.state]}>{STATE_LABEL[p.state]}</Badge>
      </div>
      <h3 className={`mt-2 text-xl ${p.state === "locked" ? "text-muted" : ""}`}>{p.module.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-muted">{p.module.description}</p>
      <p className="mt-4 text-sm text-muted">
        {p.completedCount} van {p.lessons.length} lessen afgerond
      </p>
    </>
  );
  const className = `card block p-5 transition-colors ${p.state === "locked" ? "bg-cream/60" : "hover:border-gold"}`;
  return href && p.state !== "locked" ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className} aria-disabled={p.state === "locked"}>
      {body}
    </div>
  );
}
