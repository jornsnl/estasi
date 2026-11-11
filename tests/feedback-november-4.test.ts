import { describe, expect, it } from "vitest";
import { DEFAULT_CROP, normaliseCrop, parseCrop } from "@/lib/brand-logo-urls";
import type { Block } from "@/lib/data/types";
import { assignmentAbove, newAssignment, normaliseBlocks, withFeedbackBlocks } from "@/lib/domain/assignment";
import { emptyBlock } from "@/lib/domain/blocks";

let n = 0;
const makeId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

describe("Feedbackblok (feedback Sabine 23)", () => {
  const assignment = newAssignment(makeId(), makeId);
  const text: Block = { id: makeId(), type: "text", markdown: "Uitleg", html: "" };
  const feedback = emptyBlock("feedback", "", makeId())!;

  it("is a block in Blok toevoegen", () => {
    expect(feedback).toEqual({ id: feedback.id, type: "feedback" });
  });

  it("turns on feedback for the nearest assignment above it", () => {
    const blocks = withFeedbackBlocks([assignment, text, feedback]);
    const a = blocks[0] as Extract<Block, { type: "assignment" }>;
    expect(a.feedbackAllowed).toBe(true);
    expect(assignmentAbove(blocks, 2)?.id).toBe(assignment.id);
  });

  it("does nothing without an assignment above it", () => {
    const blocks = [feedback, assignment];
    expect(withFeedbackBlocks(blocks)).toBe(blocks);
    expect(assignmentAbove(blocks, 0)).toBeNull();
  });

  it("is applied when a lesson is read", () => {
    const read = normaliseBlocks([assignment, feedback]);
    expect((read[0] as Extract<Block, { type: "assignment" }>).feedbackAllowed).toBe(true);
  });
});

describe("uitsnede van het app-icoon (feedback Sabine 3)", () => {
  it("reads the hidden field of the crop tool", () => {
    expect(parseCrop("1,0.1,-0.2")).toEqual({ zoom: 1, x: 0.1, y: -0.2 });
    expect(parseCrop("")).toBeNull();
    expect(parseCrop("1,a,0")).toBeNull();
  });

  it("keeps zoom and position within bounds", () => {
    expect(normaliseCrop({ zoom: 20, x: -5, y: 5 })).toEqual({ zoom: 3, x: -1, y: 1 });
    expect(normaliseCrop(null)).toEqual(DEFAULT_CROP);
  });
});
