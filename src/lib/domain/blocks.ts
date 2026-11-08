import type { Block, BlockType } from "@/lib/data/types";
import { newAssignment } from "./assignment";

/**
 * Per block type: its name in the editor and a new empty block. A new block
 * type gets an entry here, a reader in src/lib/lesson-blocks.ts and an editor
 * in src/components/academy/BlockFields.tsx (each is a record per type, so
 * TypeScript points out what is missing).
 */
export const BLOCK_LABELS: Record<BlockType, string> = {
  video: "Lesvideo",
  text: "Tekst",
  image: "Afbeelding",
  download: "Download of link",
  assignment: "Opdracht",
};

/** The "Blok toevoegen" buttons: intent add:<type>[:<variant>]. */
export const ADD_BLOCK_OPTIONS: { intent: string; label: string }[] = [
  { intent: "add:text", label: "Tekst" },
  { intent: "add:video", label: "Video" },
  { intent: "add:image", label: "Afbeelding" },
  { intent: "add:download", label: "Download / link" },
  { intent: "add:assignment", label: "Opdracht" },
];

const NEW_BLOCK: { [T in BlockType]: (id: string, variant: string) => Extract<Block, { type: T }> } = {
  video: (id) => ({ id, type: "video", url: "", caption: "" }),
  text: (id) => ({ id, type: "text", markdown: "", html: "" }),
  image: (id) => ({ id, type: "image", file: null, alt: "", caption: "" }),
  download: (id) => ({ id, type: "download", label: "", description: "", url: "", file: null }),
  // Fields and parts get their own ids; the editor adds more with crypto.randomUUID().
  assignment: (id) => newAssignment(id, () => crypto.randomUUID()),
};

/** Blocks that only show content (everything else is an assignment). */
export const isContentBlock = (block: Block) =>
  block.type === "video" || block.type === "text" || block.type === "image" || block.type === "download";

export const isBlockType = (value: string): value is BlockType => Object.hasOwn(NEW_BLOCK, value);

/** A new, empty block of this type, or null for an unknown type. */
export function emptyBlock(type: string, variant: string, id: string): Block | null {
  return isBlockType(type) ? NEW_BLOCK[type](id, variant) : null;
}
