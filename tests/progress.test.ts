import { describe, expect, it } from "vitest";
import type { Answer, Lesson, Module } from "@/lib/data/types";
import {
  canOpenLesson,
  courseStatus,
  feedbackState,
  missingRequired,
  moduleProgress,
  nextLesson,
  overallPercent,
} from "@/lib/domain/progress";

const modules: Module[] = [
  { id: "m1", title: "Een", description: "", position: 1 },
  { id: "m2", title: "Twee", description: "", position: 2 },
];

const lessons: Lesson[] = [
  {
    id: "l1",
    moduleId: "m1",
    title: "Les 1",
    summary: "",
    position: 1,
    blocks: [
      { id: "q1", type: "question", kind: "open", prompt: "?", helpText: "", required: true, feedback: false },
      { id: "q2", type: "question", kind: "reflection", prompt: "?", helpText: "", required: false, feedback: false },
      { id: "c1", type: "choice", prompt: "?", helpText: "", options: ["a", "b"], required: true, feedback: false },
    ],
  },
  { id: "l2", moduleId: "m1", title: "Les 2", summary: "", position: 2, blocks: [] },
  { id: "l3", moduleId: "m2", title: "Les 3", summary: "", position: 1, blocks: [] },
];

const answer = (blockId: string, patch: Partial<Answer> = {}): Answer => ({
  id: `a-${blockId}`,
  userId: "u",
  lessonId: "l1",
  blockId,
  text: "",
  choice: null,
  files: [],
  version: 1,
  createdAt: "",
  updatedAt: "",
  ...patch,
});

const done = (lessonId: string) => ({ userId: "u", lessonId, completedAt: "" });

describe("lesafronding", () => {
  it("alleen verplichte vragen tellen, lege tekst telt niet", () => {
    expect(missingRequired(lessons[0], []).map((b) => b.id)).toEqual(["q1", "c1"]);
    expect(missingRequired(lessons[0], [answer("q1", { text: "   " })]).map((b) => b.id)).toEqual(["q1", "c1"]);
    expect(missingRequired(lessons[0], [answer("q1", { text: "ja" }), answer("c1", { choice: "a" })])).toEqual([]);
  });
});

describe("moduleontgrendeling", () => {
  it("volgende module pas open als alle lessen van de vorige af zijn", () => {
    let p = moduleProgress(modules, lessons, [done("l1")]);
    expect(p.map((x) => x.state)).toEqual(["open", "locked"]);
    expect(canOpenLesson(p, "l3")).toBe(false);
    expect(nextLesson(p)?.id).toBe("l2");

    p = moduleProgress(modules, lessons, [done("l1"), done("l2")]);
    expect(p.map((x) => x.state)).toEqual(["completed", "open"]);
    expect(canOpenLesson(p, "l3")).toBe(true);
    expect(overallPercent(p)).toBe(67);
  });

  it("100% is nog geen formele afronding", () => {
    const enrollment = { onlineCompletedAt: null, practicalStatus: "none" } as never;
    expect(courseStatus(enrollment, 100)).toBe("awaiting_confirmation");
    expect(courseStatus({ onlineCompletedAt: "x", practicalStatus: "none" } as never, 100)).toBe("online_completed");
  });
});

describe("feedback", () => {
  it("toont of een antwoord na feedback is aangepast", () => {
    const a = answer("q1", { text: "v1" });
    expect(feedbackState(a, [])).toBe("open");
    const fb = { id: "f", answerId: a.id, userId: "u", authorId: "o", text: "", attachment: null, answerVersion: 1, createdAt: "" };
    expect(feedbackState(a, [fb])).toBe("given");
    expect(feedbackState({ ...a, version: 2 }, [fb])).toBe("changed_after_feedback");
  });
});
