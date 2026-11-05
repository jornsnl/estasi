import type { PackageType } from "@/lib/data/types";

/** One name per package, used on every screen. */
export const PACKAGE_LABELS: Record<PackageType, string> = {
  A: "Online",
  B: "Online + praktijk",
};

/** "1 vraag", "3 vragen". */
export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
