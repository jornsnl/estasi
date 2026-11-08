import type { Enrollment, Lesson, Module, ModulePackages, PackageType } from "@/lib/data/types";

/** The three choices per module, in the order of the select. */
export const MODULE_PACKAGE_OPTIONS: { value: ModulePackages; label: string }[] = [
  { value: "AB", label: "Beide pakketten" },
  { value: "A", label: "Alleen pakket A" },
  { value: "B", label: "Alleen pakket B" },
];

export const MODULE_PACKAGE_LABELS: Record<ModulePackages, string> = {
  AB: "Pakket A en B",
  A: "Alleen pakket A",
  B: "Alleen pakket B",
};

export const parseModulePackages = (value: unknown): ModulePackages =>
  value === "A" || value === "B" ? value : "AB";

export const isPublished = (item: { status?: string }) => (item.status ?? "published") === "published";

export const packageAllows = (packages: ModulePackages | undefined, pkg: PackageType) => (packages ?? "AB").includes(pkg);

/**
 * May this student see and open the module at all? Only published modules
 * meant for the student's package. Locking (previous module not finished yet)
 * is a separate rule in progress.ts.
 */
export function moduleVisibleFor(module: Module, enrollment: Pick<Enrollment, "package"> | null): boolean {
  if (!enrollment) return false;
  return isPublished(module) && packageAllows(module.packages, enrollment.package);
}

/** A lesson is visible when it is published and its module is visible. */
export function lessonVisibleFor(lesson: Lesson, module: Module | undefined, enrollment: Pick<Enrollment, "package"> | null): boolean {
  return !!module && module.id === lesson.moduleId && isPublished(lesson) && moduleVisibleFor(module, enrollment);
}

/**
 * The part of the course this student has: only that part counts for
 * progress and the certificate, and only that part can be opened.
 * After an upgrade from A to B the B modules simply appear; completions are
 * never removed, so progress made earlier stays.
 */
export function visibleCourse(modules: Module[], lessons: Lesson[], enrollment: Pick<Enrollment, "package"> | null) {
  const candidates = modules.filter((m) => moduleVisibleFor(m, enrollment));
  const byId = new Map(candidates.map((m) => [m.id, m]));
  const visibleLessons = lessons.filter((l) => lessonVisibleFor(l, byId.get(l.moduleId), enrollment));
  // A published module whose lessons are all still concepts has nothing to show yet. Leaving it
  // out also keeps it from locking the modules after it (an empty module can never be completed).
  const withLessons = new Set(visibleLessons.map((l) => l.moduleId));
  return { modules: candidates.filter((m) => withLessons.has(m.id)), lessons: visibleLessons };
}

const FILE_LINK = /\/api\/bestanden\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

/**
 * Ids of the uploaded files the live content of a lesson uses: downloads,
 * images, pictures inside text and any other file reference in a block
 * (a FileRef: an object with id and mime). Drafts are left out on purpose,
 * so a file that is only in an unpublished draft cannot be opened by a student.
 */
export function lessonFileIds(lesson: Pick<Lesson, "blocks">): Set<string> {
  const ids = new Set<string>();
  const walk = (value: unknown) => {
    if (typeof value === "string") {
      for (const m of value.matchAll(FILE_LINK)) ids.add(m[1].toLowerCase());
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (typeof record.id === "string" && typeof record.mime === "string") ids.add(record.id.toLowerCase());
      Object.values(record).forEach(walk);
    }
  };
  walk(lesson.blocks);
  return ids;
}
