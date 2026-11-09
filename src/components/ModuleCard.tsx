import Link from "next/link";
import { plural } from "@/lib/domain/labels";
import type { ModuleProgress } from "@/lib/domain/progress";
import { Badge } from "./Badge";

const STATE_LABEL = { locked: "Vergrendeld", open: "Beschikbaar", completed: "Afgerond" } as const;
const STATE_TONE = { locked: "neutral", open: "gold", completed: "success" } as const;

/**
 * A module as a square tile with round corners (feedback Academy): the photo
 * of the module on top (set in Lesinhoud, like the photo of a recommendation),
 * or a calm brand surface with the module number when there is none.
 */
export function ModuleCard({ p, index, href }: { p: ModuleProgress; index: number; href?: string }) {
  const locked = p.state === "locked";
  const image = p.module.imageFileId;
  const body = (
    <>
      <div className="relative h-28 shrink-0 overflow-hidden bg-gold-soft sm:h-auto sm:min-h-0 sm:flex-1">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- private course file behind /api/bestanden
          <img src={`/api/bestanden/${image}`} alt="" loading="lazy" className={`h-full w-full object-cover ${locked ? "opacity-60 grayscale" : ""}`} />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-bordeaux-soft to-gold-soft" aria-hidden>
            <span className="font-serif text-6xl text-bordeaux/30">{index + 1}</span>
          </div>
        )}
        <span className="absolute top-3 right-3">
          <Badge tone={STATE_TONE[p.state]}>{STATE_LABEL[p.state]}</Badge>
        </span>
      </div>
      <div className="shrink-0 p-4">
        <span className="eyebrow">Module {index + 1}</span>
        <h3 className={`mt-1 line-clamp-2 text-base leading-snug sm:text-lg ${locked ? "text-muted" : ""}`}>{p.module.title}</h3>
        <p className="mt-1.5 text-xs text-muted">
          {p.completedCount} van {plural(p.lessons.length, "les", "lessen")} afgerond
          {p.assignments.total > 0 && ` · ${p.assignments.submitted}/${p.assignments.total} opdrachten`}
        </p>
      </div>
    </>
  );
  const className = `card flex flex-col sm:aspect-square overflow-hidden rounded-3xl p-0 transition ${locked ? "bg-cream/60" : "hover:-translate-y-0.5 hover:border-gold hover:shadow-md"}`;
  return href && !locked ? (
    <Link href={href} className={className} title={p.module.description || undefined}>
      {body}
    </Link>
  ) : (
    <div className={className} aria-disabled={locked}>
      {body}
    </div>
  );
}
