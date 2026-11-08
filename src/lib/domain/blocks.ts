import type { Block, BlockType, QuestionKind } from "@/lib/data/types";

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
  question: "Vraag",
  choice: "Meerkeuze",
  upload: "Bestand inleveren",
};

/** The "Blok toevoegen" buttons: intent add:<type>[:<variant>]. */
export const ADD_BLOCK_OPTIONS: { intent: string; label: string }[] = [
  { intent: "add:text", label: "Tekst" },
  { intent: "add:video", label: "Video" },
  { intent: "add:image", label: "Afbeelding" },
  { intent: "add:download", label: "Download / link" },
  { intent: "add:question:open", label: "Open vraag" },
  { intent: "add:question:reflection", label: "Reflectievraag" },
  { intent: "add:question:practice", label: "Praktijkopdracht" },
  { intent: "add:choice", label: "Meerkeuze" },
  { intent: "add:upload", label: "Bestand inleveren" },
];

const QUESTION_KINDS: QuestionKind[] = ["open", "reflection", "practice"];

const NEW_BLOCK: { [T in BlockType]: (id: string, variant: string) => Extract<Block, { type: T }> } = {
  video: (id) => ({ id, type: "video", url: "", caption: "" }),
  text: (id) => ({ id, type: "text", markdown: "", html: "" }),
  image: (id) => ({ id, type: "image", file: null, alt: "", caption: "" }),
  download: (id) => ({ id, type: "download", label: "", description: "", url: "", file: null }),
  question: (id, variant) => ({
    id,
    type: "question",
    kind: QUESTION_KINDS.includes(variant as QuestionKind) ? (variant as QuestionKind) : "open",
    prompt: "",
    helpText: "",
    required: true,
    feedback: false,
  }),
  choice: (id) => ({ id, type: "choice", prompt: "", helpText: "", options: ["", ""], required: true, feedback: false }),
  upload: (id) => ({ id, type: "upload", prompt: "", helpText: "", required: false, feedback: true }),
};

/** Blocks that only show content (everything else is a question or an assignment). */
export const isContentBlock = (block: Block) =>
  block.type === "video" || block.type === "text" || block.type === "image" || block.type === "download";

export const isBlockType = (value: string): value is BlockType => Object.hasOwn(NEW_BLOCK, value);

/** A new, empty block of this type, or null for an unknown type. */
export function emptyBlock(type: string, variant: string, id: string): Block | null {
  return isBlockType(type) ? NEW_BLOCK[type](id, variant) : null;
}
