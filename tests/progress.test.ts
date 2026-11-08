import { describe, expect, it } from "vitest";
import type { AssignmentBlock, Lesson, Module, PackageType } from "@/lib/data/types";
import {
  canOpenLesson,
  completedModules,
  courseStatus,
  modulePercent,
  moduleProgress,
  nextLesson,
  openFeedbackCount,
  overallPercent,
} from "@/lib/domain/progress";
import { visibleCourse } from "@/lib/domain/visibility";

const modules: Module[] = [
  { id: "m1", title: "Een", description: "", position: 1 },
  { id: "m2", title: "Twee", description: "", position: 2 },
  { id: "m3", title: "Drie", description: "", position: 3 },
];

const assignment = (id: string, requiredForLesson = true): AssignmentBlock => ({
  id,
  type: "assignment",
  title: "",
  intro: "",
  requiredForLesson,
  feedbackAllowed: false,
  graded: false,
  repeatOf: null,
  parts: [{ id: `${id}-p`, title: "", intro: "", fields: [{ id: `${id}-f`, type: "long", label: "?", help: "", required: true }] }],
});

const lessons: Lesson[] = [
  { id: "l1", moduleId: "m1", title: "Les 1", summary: "", position: 1, blocks: [assignment("a1"), assignment("a2", false)] },
  { id: "l2", moduleId: "m1", title: "Les 2", summary: "", position: 2, blocks: [] },
  { id: "l3", moduleId: "m2", title: "Les 3", summary: "", position: 1, blocks: [assignment("a3")] },
  { id: "l4", moduleId: "m3", title: "Les 4", summary: "", position: 1, blocks: [] },
];

const done = (lessonId: string) => ({ userId: "u", lessonId, completedAt: "" });

describe("moduleontgrendeling", () => {
  it("volgende module pas open als alle lessen van de vorige af zijn", () => {
    let p = moduleProgress(modules, lessons, [done("l1")]);
    expect(p.map((x) => x.state)).toEqual(["open", "locked", "locked"]);
    expect(canOpenLesson(p, "l3")).toBe(false);
    expect(nextLesson(p)?.id).toBe("l2");

    p = moduleProgress(modules, lessons, [done("l1"), done("l2")]);
    expect(p.map((x) => x.state)).toEqual(["completed", "open", "locked"]);
    expect(canOpenLesson(p, "l3")).toBe(true);
    expect(overallPercent(p)).toBe(50);
    expect(completedModules(p)).toBe(1);
    expect(modulePercent(p[0])).toBe(100);
  });

  it("Sabine kan een module per cursist eerder vrijgeven; daarna loopt de volgorde gewoon door", () => {
    let p = moduleProgress(modules, lessons, [], { unlocks: [{ moduleId: "m2" }] });
    expect(p.map((x) => x.state)).toEqual(["open", "open", "locked"]);
    expect(p[1].unlockedManually).toBe(true);
    expect(canOpenLesson(p, "l3")).toBe(true);
    // Module 2 af (handmatig vrijgegeven): module 3 gaat ook open.
    p = moduleProgress(modules, lessons, [done("l3")], { unlocks: [{ moduleId: "m2" }] });
    expect(p.map((x) => x.state)).toEqual(["open", "completed", "open"]);
    // Een vrijgave van een module die toch al open is, telt niet als handmatig.
    p = moduleProgress(modules, lessons, [done("l1"), done("l2")], { unlocks: [{ moduleId: "m2" }] });
    expect(p[1].unlockedManually).toBe(false);
  });

  it("een module zonder lessen houdt de volgende niet tegen", () => {
    const p = moduleProgress([...modules.slice(0, 1), { id: "leeg", title: "Leeg", description: "", position: 2 }, modules[1]], lessons, [done("l1"), done("l2")]);
    expect(p.map((x) => x.state)).toEqual(["completed", "open", "open"]);
  });

  it("telt ingediende opdrachten per module; openstaande feedback blokkeert niets", () => {
    const p = moduleProgress(modules, lessons, [done("l1")], {
      submissions: [
        { lessonId: "l1", blockId: "a1", status: "ingediend" },
        { lessonId: "l1", blockId: "a2", status: "concept" },
      ],
    });
    expect(p[0].assignments).toEqual({ total: 2, submitted: 1 });
    expect(p[1].assignments).toEqual({ total: 1, submitted: 0 });
    expect(openFeedbackCount([{ feedbackStatus: "nieuw" }, { feedbackStatus: "in_behandeling" }, { feedbackStatus: "afgerond" }, { feedbackStatus: null }])).toBe(2);
  });
});

describe("pakketten (visibleCourse uit visibility.ts) en voortgang", () => {
  const withPackages: Module[] = [
    { ...modules[0], packages: "AB" },
    { ...modules[1], packages: "B" },
    modules[2],
  ];
  const progressFor = (pkg: PackageType, completions: ReturnType<typeof done>[]) => {
    const course = visibleCourse(withPackages, lessons, { package: pkg });
    return moduleProgress(course.modules, course.lessons, completions);
  };

  it("modules buiten het pakket tellen niet mee en houden niets tegen", () => {
    const a = progressFor("A", [done("l1"), done("l2")]);
    expect(a.map((p) => p.module.id)).toEqual(["m1", "m3"]);
    expect(a.map((p) => p.state)).toEqual(["completed", "open"]);
    expect(overallPercent(a)).toBe(67);
    expect(canOpenLesson(a, "l3")).toBe(false);
    // Na een upgrade naar B: de voortgang blijft, de extra module komt erbij.
    const b = progressFor("B", [done("l1"), done("l2")]);
    expect(b.map((p) => p.state)).toEqual(["completed", "open", "locked"]);
    expect(b[0].completedCount).toBe(2);
  });
});

describe("cursusstatus", () => {
  it("100% is nog geen formele afronding", () => {
    const enrollment = { onlineCompletedAt: null, practicalStatus: "none" } as never;
    expect(courseStatus(enrollment, 100)).toBe("awaiting_confirmation");
    expect(courseStatus({ onlineCompletedAt: "x", practicalStatus: "none" } as never, 100)).toBe("online_completed");
  });

  it("verlopen of ingetrokken toegang zonder afronding staat niet meer op bezig", () => {
    const enrollment = { onlineCompletedAt: null, practicalStatus: "none" } as never;
    expect(courseStatus(enrollment, 40, "active")).toBe("in_progress");
    expect(courseStatus(enrollment, 40, "paused")).toBe("in_progress");
    expect(courseStatus(enrollment, 40, "expired")).toBe("expired");
    expect(courseStatus(enrollment, 40, "revoked")).toBe("stopped");
    // Alles af maar daarna verlopen: de opleider moet nog bevestigen.
    expect(courseStatus(enrollment, 100, "expired")).toBe("awaiting_confirmation");
    expect(courseStatus({ onlineCompletedAt: "x", practicalStatus: "none" } as never, 100, "expired")).toBe("online_completed");
  });
});
