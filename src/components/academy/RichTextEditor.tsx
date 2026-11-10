"use client";

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import { uploadLessonImage } from "@/app/actions/content";
import { shrinkPhoto } from "@/lib/shrink-photo";

/**
 * Text editor for lesson text (TipTap). Writes HTML into a hidden form field
 * with the given name, so it saves with the rest of the lesson form; the
 * server cleans it with an allowlist (src/lib/domain/html.ts).
 *
 * An older block in Markdown passes its rendered Markdown as children: the
 * editor starts from that HTML. The hidden field only exists once the editor
 * is ready, so without JavaScript nothing is overwritten.
 */
export function RichTextEditor({
  name,
  initialHtml,
  label,
  placeholder = "Schrijf hier de tekst van de les…",
  children,
}: {
  name: string;
  initialHtml?: string;
  label: string;
  placeholder?: string;
  /** Rendered Markdown of an older block, used as the starting content when there is no HTML yet. */
  children?: React.ReactNode;
}) {
  const source = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: false, code: false, codeBlock: false }),
      Link.configure({ openOnClick: false, autolink: true, protocols: ["mailto", "tel"], HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
      Image.configure({ inline: false, allowBase64: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder }),
    ],
    editorProps: {
      attributes: { class: "prose-academy min-h-40 px-4 py-3 focus:outline-none", "aria-label": label, role: "textbox", "aria-multiline": "true" },
    },
    onCreate: ({ editor }) => {
      if (initialHtml === undefined && source.current) editor.commands.setContent(source.current.innerHTML, { emitUpdate: false });
      setHtml(editor.getHTML());
    },
    onUpdate: ({ editor }) => setHtml(editor.getHTML()),
    content: initialHtml ?? "",
  });

  // Tell the unsaved-changes warning (DirtyGuard) that the text changed.
  const first = useRef(true);
  useEffect(() => {
    if (html === null) return;
    if (first.current) {
      first.current = false;
      return;
    }
    field.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [html]);

  async function addImage(file: File) {
    if (!editor) return;
    setError("");
    setUploading(true);
    const data = new FormData();
    try {
      // Large photos first made smaller, so they always fit through the upload.
      data.set("file", await shrinkPhoto(file));
    } catch (err) {
      setUploading(false);
      setError((err as Error).message);
      return;
    }
    const result = await uploadLessonImage(data).catch(() => ({ ok: false as const, error: "Het uploaden is niet gelukt. Probeer het nog een keer." }));
    setUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const alt = window.prompt("Korte omschrijving van de afbeelding (voor schermlezers, optioneel)", "") ?? "";
    editor.chain().focus().setImage({ src: result.url, alt }).run();
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white focus-within:border-bordeaux">
      {children !== undefined && (
        <div ref={source} hidden>
          {children}
        </div>
      )}
      {editor && <Toolbar editor={editor} onImage={() => fileInput.current?.click()} uploading={uploading} />}
      <EditorContent editor={editor} />
      {!editor && <div className="min-h-40 px-4 py-3 text-sm text-muted">Editor laden…</div>}
      {html !== null && <input ref={field} type="hidden" name={name} value={html} />}
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,.heic"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        // Not part of the lesson form: the picture is uploaded on its own.
        form="geen-formulier"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void addImage(file);
        }}
      />
      {error && <p role="alert" className="border-t border-line px-4 py-2 text-sm text-bordeaux">{error}</p>}
    </div>
  );
}

function Toolbar({ editor, onImage, uploading }: { editor: Editor; onImage: () => void; uploading: boolean }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      link: e.isActive("link"),
      table: e.isActive("table"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  function setLink() {
    const previous = (editor.getAttributes("link").href as string | undefined) ?? "";
    const input = window.prompt("Link (https://…, of leeg om de link weg te halen)", previous || "https://");
    if (input === null) return;
    const url = input.trim();
    if (!url || url === "https://") {
      chain().extendMarkRange("link").unsetLink().run();
      return;
    }
    const href = /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}`;
    if (editor.state.selection.empty && !state.link) {
      chain().insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      chain().extendMarkRange("link").setLink({ href }).run();
    }
  }

  const buttons: { label: string; title: string; active?: boolean; disabled?: boolean; onClick: () => void; className?: string }[] = [
    { label: "Kop", title: "Kop", active: state.h2, onClick: () => chain().toggleHeading({ level: 2 }).run() },
    { label: "Tussenkop", title: "Tussenkop", active: state.h3, onClick: () => chain().toggleHeading({ level: 3 }).run() },
    { label: "B", title: "Vet (Ctrl+B)", active: state.bold, onClick: () => chain().toggleBold().run(), className: "font-bold" },
    { label: "I", title: "Cursief (Ctrl+I)", active: state.italic, onClick: () => chain().toggleItalic().run(), className: "italic" },
    { label: "U", title: "Onderstrepen (Ctrl+U)", active: state.underline, onClick: () => chain().toggleUnderline().run(), className: "underline" },
    { label: "• Opsomming", title: "Opsomming", active: state.bullet, onClick: () => chain().toggleBulletList().run() },
    { label: "1. Nummering", title: "Genummerde lijst", active: state.ordered, onClick: () => chain().toggleOrderedList().run() },
    { label: "Link", title: "Link", active: state.link, onClick: setLink },
    { label: uploading ? "Uploaden…" : "Afbeelding", title: "Afbeelding invoegen", disabled: uploading, onClick: onImage },
    { label: "Tabel", title: "Tabel invoegen", disabled: state.table, onClick: () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  ];
  const tableButtons = [
    { label: "+ Rij", title: "Rij toevoegen", onClick: () => chain().addRowAfter().run() },
    { label: "− Rij", title: "Rij verwijderen", onClick: () => chain().deleteRow().run() },
    { label: "+ Kolom", title: "Kolom toevoegen", onClick: () => chain().addColumnAfter().run() },
    { label: "− Kolom", title: "Kolom verwijderen", onClick: () => chain().deleteColumn().run() },
    { label: "Tabel weg", title: "Tabel verwijderen", onClick: () => chain().deleteTable().run() },
  ];

  const button = (b: (typeof buttons)[number]) => (
    <button
      key={b.title}
      type="button"
      title={b.title}
      aria-label={b.title}
      aria-pressed={b.active === undefined ? undefined : b.active}
      disabled={b.disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={b.onClick}
      className={`rounded-md px-2.5 py-1 text-sm text-ink hover:bg-white disabled:opacity-40 ${b.active ? "bg-white ring-1 ring-gold" : ""} ${b.className ?? ""}`}
    >
      {b.label}
    </button>
  );

  return (
    <div role="toolbar" aria-label="Tekstopmaak" className="sticky top-0 z-[1] flex flex-wrap items-center gap-1 border-b border-line bg-cream/90 p-1.5 backdrop-blur">
      {buttons.map(button)}
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      {button({ label: "↶", title: "Ongedaan maken (Ctrl+Z)", disabled: !state.canUndo, onClick: () => chain().undo().run() })}
      {button({ label: "↷", title: "Opnieuw (Ctrl+Y)", disabled: !state.canRedo, onClick: () => chain().redo().run() })}
      {state.table && (
        <span className="flex w-full flex-wrap gap-1 border-t border-line pt-1">
          {tableButtons.map((b) => button(b))}
        </span>
      )}
    </div>
  );
}
