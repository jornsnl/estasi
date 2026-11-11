import { Markdown } from "@/components/Markdown";
import { PhotoInput } from "@/components/PhotoInput";
import { VideoEmbed } from "@/components/VideoEmbed";
import type { Block, BlockType } from "@/lib/data";
import { LIMITS } from "@/lib/domain/input";
import { ACCEPT_ATTR, IMAGE_ACCEPT_ATTR } from "@/lib/uploads";
import { formatBytes } from "@/lib/util/format";
import { HEADING_STYLES } from "@/lib/domain/blocks";
import { AssignmentEditor, type AssignmentChoice } from "./AssignmentEditor";
import { HeadingContent } from "./HeadingContent";
import { FormatTextarea } from "./FormatTextarea";
import { RichTextEditor } from "./RichTextEditor";

/**
 * The fields of one block in the lesson editor, one editor per block type.
 * Field names are "b.<blockId>.<field>"; src/lib/lesson-blocks.ts reads them
 * back. A block type with its own editor component (for example an
 * assignment builder) adds it to EDITORS; it may write its whole block as
 * JSON into one hidden field.
 */
export interface BlockEditorProps<T extends Block = Block> {
  block: T;
  /** Form field name for a field of this block. */
  n: (field: string) => string;
  /** Element id for a field of this block. */
  id: (field: string) => string;
  context?: BlockEditorContext;
}

/** Course-wide data some editors need (the assignment editor: other assignments for "herhaling van"). */
export interface BlockEditorContext {
  assignments: AssignmentChoice[];
}

type Editors = { [T in BlockType]: (props: BlockEditorProps<Extract<Block, { type: T }>>) => React.ReactNode };

const EDITORS: Editors = {
  heading: ({ block, n, id }) => (
    <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
      <div>
        <label className="label" htmlFor={id("text")}>Tekst</label>
        <input id={id("text")} name={n("text")} defaultValue={block.text} maxLength={LIMITS.caption} className="input" />
      </div>
      <div>
        <label className="label" htmlFor={id("style")}>Stijl</label>
        <select id={id("style")} name={n("style")} defaultValue={block.style} className="input">
          {HEADING_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2 rounded-lg border border-line bg-white px-4 py-3">
        <HeadingContent block={block.text ? block : { ...block, text: "Voorbeeld van deze stijl" }} />
      </div>
    </div>
  ),
  goals: ({ block, n, id }) => (
    <>
      <div>
        <label className="label" htmlFor={id("title")}>Titel van het blok</label>
        <input id={id("title")} name={n("title")} defaultValue={block.title} maxLength={120} className="input" />
      </div>
      <div>
        <label className="label" htmlFor={id("items")}>Leerdoelen (één per regel)</label>
        <FormatTextarea id={id("items")} name={n("items")} defaultValue={block.items.join("\n")} rows={4} placeholder={"Je weet hoe je een draaiboek opbouwt\nJe kunt een budget verdelen"} />
      </div>
    </>
  ),
  video: ({ block, n, id }) => (
    <>
      <div>
        <label className="label" htmlFor={id("url")}>Videolink (YouTube of Vimeo)</label>
        <input id={id("url")} name={n("url")} inputMode="url" autoComplete="off" defaultValue={block.url} maxLength={LIMITS.url} className="input" placeholder="https://vimeo.com/…" />
        <p className="hint">Zet de video op YouTube of Vimeo en plak hier de link; ook lange video&apos;s werken zo.</p>
      </div>
      <div>
        <label className="label" htmlFor={id("cap")}>Onderschrift (optioneel)</label>
        <input id={id("cap")} name={n("caption")} defaultValue={block.caption} maxLength={LIMITS.caption} className="input" />
      </div>
      {block.url && <VideoEmbed url={block.url} title={block.caption || "Voorbeeld"} />}
    </>
  ),
  text: ({ block, n }) => (
    <>
      {block.html || !block.markdown ? (
        <RichTextEditor name={n("html")} initialHtml={block.html ?? ""} label="Tekst" />
      ) : (
        // An older Markdown block: the editor starts from the rendered Markdown and saves it as HTML.
        <RichTextEditor name={n("html")} label="Tekst">
          <Markdown>{block.markdown}</Markdown>
        </RichTextEditor>
      )}
      <p className="hint">Koppen, vet, cursief, onderstrepen, lijsten, links, tabellen en afbeeldingen via de knoppen. Enter begint een nieuwe alinea.</p>
    </>
  ),
  image: ({ block, n, id }) => (
    <>
      {block.file ? (
        <figure className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- private file behind /api/bestanden */}
          <img src={`/api/bestanden/${block.file.id}`} alt={block.alt} className="max-h-80 rounded-lg border border-line" />
          <figcaption className="text-xs text-muted">{block.file.name} ({formatBytes(block.file.size)})</figcaption>
        </figure>
      ) : (
        <p className="text-sm text-muted">Nog geen afbeelding.</p>
      )}
      <div>
        <p className="label">{block.file ? "Andere afbeelding kiezen" : "Afbeelding kiezen"} (jpg, png, webp of gif)</p>
        <PhotoInput name={n("file")} label="Afbeelding kiezen" accept={`${IMAGE_ACCEPT_ATTR},image/heic,.heic`} saveLabel="Afbeelding opslaan" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={id("alt")}>Omschrijving (voor schermlezers)</label>
          <input id={id("alt")} name={n("alt")} defaultValue={block.alt} maxLength={LIMITS.alt} className="input" />
        </div>
        <div>
          <label className="label" htmlFor={id("cap")}>Onderschrift (optioneel)</label>
          <input id={id("cap")} name={n("caption")} defaultValue={block.caption} maxLength={LIMITS.caption} className="input" />
        </div>
      </div>
    </>
  ),
  download: ({ block, n, id }) => (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={id("lbl")}>Titel</label>
          <input id={id("lbl")} name={n("label")} defaultValue={block.label} maxLength={LIMITS.downloadLabel} className="input" />
        </div>
        <div>
          <label className="label" htmlFor={id("desc")}>Omschrijving</label>
          <input id={id("desc")} name={n("description")} defaultValue={block.description} maxLength={LIMITS.downloadDescription} className="input" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={id("url")}>Externe link (of upload hieronder een bestand)</label>
        <input id={id("url")} name={n("url")} inputMode="url" autoComplete="off" defaultValue={block.url} maxLength={LIMITS.url} className="input" />
      </div>
      {block.file ? (
        <p className="text-sm">
          Bestand: <a href={`/api/bestanden/${block.file.id}`} className="text-bordeaux underline">{block.file.name}</a> ({formatBytes(block.file.size)})
          <label className="ml-3 inline-flex items-center gap-1 text-muted">
            <input type="checkbox" name={n("removeFile")} /> verwijderen
          </label>
        </p>
      ) : null}
      <input type="file" name={n("file")} accept={ACCEPT_ATTR} className="text-sm" aria-label="Bestand uploaden" />
    </>
  ),
  assignment: ({ block, context }) => <AssignmentEditor block={block} others={(context?.assignments ?? []).filter((o) => o.id !== block.id)} />,
};

export function BlockFields({ block, context }: { block: Block; context?: BlockEditorContext }) {
  const props: BlockEditorProps = { block, n: (field) => `b.${block.id}.${field}`, id: (field) => `${field}-${block.id}`, context };
  const Editor = EDITORS[block.type] as ((p: BlockEditorProps) => React.ReactNode) | undefined;
  return <div className="space-y-3">{Editor ? Editor(props) : <p className="text-sm text-muted">Dit soort blok kan hier niet bewerkt worden.</p>}</div>;
}
