import Link from "next/link";
import { plural } from "@/lib/domain/labels";
import type { ModuleProgress } from "@/lib/domain/progress";
import { Badge } from "./Badge";

const STATE_LABEL = { locked: "Vergrendeld", open: "Beschikbaar", completed: "Afgerond" } as const;
const STATE_TONE = { locked: "neutral", open: "gold", completed: "success" } as const;

/**
 * A module as a tile with round corners (feedback Academy): the photo of the
 * module on top (set in Lesinhoud, like the photo of a recommendation), or a
 * calm brand surface with the module number when there is none.
 *
 * Feedback Sabine: the photos were not all equally high, so text and photos
 * did not line up. The photo now has a fixed ratio (a little higher than
 * before) and the title always takes two lines, so every tile in a row has
 * the photo, the title and the line below it at the same height.
 */
export function ModuleCard({ p, index, href }: { p: ModuleProgress; index: number; href?: string }) {
  const locked = p.state === "locked";
  const image = p.module.imageFileId;
  const body = (
    <>
      <div className="relative aspect-[4/3] shrink-0 overflow-hidden bg-gold-soft">
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
      <div className="flex flex-1 flex-col p-4">
        <span className="eyebrow">Module {index + 1}</span>
        <h3 className={`mt-1 line-clamp-2 min-h-[2.75em] text-base leading-snug sm:text-lg ${locked ? "text-muted" : ""}`}>{p.module.title}</h3>
        <p className="mt-auto pt-1.5 text-xs text-muted">
          {p.completedCount} van {plural(p.lessons.length, "les", "lessen")} afgerond
          {p.assignments.total > 0 && ` · ${p.assignments.submitted}/${p.assignments.total} opdrachten`}
        </p>
      </div>
    </>
  );
  const className = `card flex h-full flex-col overflow-hidden rounded-3xl p-0 transition ${locked ? "bg-cream/60" : "hover:-translate-y-0.5 hover:border-gold hover:shadow-md"}`;
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
