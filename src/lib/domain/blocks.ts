import type { Block, BlockType, HeadingStyle } from "@/lib/data/types";
import { newAssignment } from "./assignment";

/**
 * Per block type: its name in the editor and a new empty block. A new block
 * type gets an entry here, a reader in src/lib/lesson-blocks.ts and an editor
 * in src/components/academy/BlockFields.tsx (each is a record per type, so
 * TypeScript points out what is missing).
 */
export const BLOCK_LABELS: Record<BlockType, string> = {
  heading: "Titel",
  goals: "Leerdoelen",
  video: "Lesvideo",
  text: "Tekst",
  image: "Afbeelding",
  download: "Download of link",
  assignment: "Opdracht",
  feedback: "Feedback",
};

/** The "Blok toevoegen" buttons: intent add:<type>[:<variant>]. */
export const ADD_BLOCK_OPTIONS: { intent: string; label: string }[] = [
  { intent: "add:heading:title", label: "Hoofdtitel" },
  { intent: "add:heading:subtitle", label: "Subtitel" },
  { intent: "add:heading:caption", label: "Bijschrift" },
  { intent: "add:goals", label: "Leerdoelen" },
  { intent: "add:heading:assignment", label: "Opdrachttitel" },
  { intent: "add:text", label: "Tekstvak" },
  { intent: "add:video", label: "Video" },
  { intent: "add:image", label: "Afbeelding" },
  { intent: "add:download", label: "Download / link" },
  { intent: "add:assignment", label: "Opdracht" },
  { intent: "add:feedback", label: "Feedback" },
];

/** The styles of a title block, in the order of the editor. */
export const HEADING_STYLES: { value: HeadingStyle; label: string }[] = [
  { value: "title", label: "Hoofdtitel (zwart)" },
  { value: "subtitle", label: "Subtitel (bordeaux)" },
  { value: "caption", label: "Bijschrift (zwart)" },
  { value: "assignment", label: "Opdrachttitel (zwart)" },
];

export const isHeadingStyle = (value: string): value is HeadingStyle => HEADING_STYLES.some((s) => s.value === value);

const NEW_BLOCK: { [T in BlockType]: (id: string, variant: string) => Extract<Block, { type: T }> } = {
  heading: (id, variant) => ({ id, type: "heading", style: isHeadingStyle(variant) ? variant : "title", text: "" }),
  goals: (id) => ({ id, type: "goals", title: "Leerdoelen", items: [] }),
  video: (id) => ({ id, type: "video", url: "", caption: "" }),
  text: (id) => ({ id, type: "text", markdown: "", html: "" }),
  image: (id) => ({ id, type: "image", file: null, alt: "", caption: "" }),
  download: (id) => ({ id, type: "download", label: "", description: "", url: "", file: null }),
  // Fields and parts get their own ids; the editor adds more with crypto.randomUUID().
  assignment: (id) => newAssignment(id, () => crypto.randomUUID()),
  feedback: (id) => ({ id, type: "feedback" }),
};

/** Blocks that only show content (everything else is an assignment). */
export const isContentBlock = (block: Block) => block.type !== "assignment";

export const isBlockType = (value: string): value is BlockType => Object.hasOwn(NEW_BLOCK, value);

/** A new, empty block of this type, or null for an unknown type. */
export function emptyBlock(type: string, variant: string, id: string): Block | null {
  return isBlockType(type) ? NEW_BLOCK[type](id, variant) : null;
}
