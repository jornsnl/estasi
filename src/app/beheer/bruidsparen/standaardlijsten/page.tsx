import { archiveCategory, saveCategory } from "@/app/actions/ws-admin";
import { saveDefaultPackingItem, saveGroupPhotoIntro } from "@/app/actions/ws-lists";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { AutoTextarea } from "@/components/ws/AutoTextarea";
import { query } from "@/lib/ws/db";
import { getSettings } from "@/lib/ws/settings";
import type { SupplierCategory } from "@/lib/ws/types";
import { DefaultsExtra } from "./extra";

export const metadata = { title: "Standaardlijsten" };

const LISTS = [["wedding", "Inpaklijst bruiloft"], ["bag", "What's in my bag"], ["styling", "Styling meenemen"]] as const;

export default async function DefaultLists({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [items, settings, categories] = await Promise.all([
    query<{ id: string; list_kind: string; what: string }>("select id, list_kind, what from default_packing_items order by list_kind, position"),
    getSettings(),
    query<SupplierCategory>("select * from supplier_categories where couple_id is null order by archived, position, name"),
  ]);
  return (
    <div className="max-w-4xl space-y-8">
      <header>
        <p className="eyebrow">Beheer</p>
        <h1 className="mt-1 text-3xl">Standaardlijsten</h1>
        <p className="mt-1 text-sm text-muted">Wat elk nieuw bruidspaar standaard krijgt. Bestaande bruidsparen houden hun eigen lijsten (behalve de vaste tekst bij de groepsfoto&apos;s, die geldt meteen overal).</p>
      </header>
      <Notice searchParams={searchParams} />

      <DefaultsExtra />

      <section id="meeneemlijst" className="scroll-mt-6 space-y-4">
        <h2 className="section-title">Meeneemlijsten</h2>
        {LISTS.map(([kind, title]) => (
          <div key={kind} className="card p-4">
            <h3 className="mb-2 font-serif text-lg font-semibold">{title}</h3>
            <ul className="space-y-1.5">
              {items.filter((i) => i.list_kind === kind).map((i) => (
                <li key={i.id}>
                  <form action={saveDefaultPackingItem} className="flex gap-2">
                    <input type="hidden" name="itemId" value={i.id} />
                    <input type="hidden" name="listKind" value={kind} />
                    <input name="what" defaultValue={i.what} aria-label="Item" className="input flex-1 py-1" />
                    <SubmitButton className="btn-ghost py-1 text-xs">Opslaan</SubmitButton>
                    <SubmitButton name="intent" value="delete" className="btn-ghost py-1 text-xs text-bordeaux">×</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
            <form action={saveDefaultPackingItem} className="mt-2 flex gap-2">
              <input type="hidden" name="listKind" value={kind} />
              <input name="what" required placeholder="Nieuw item" aria-label={`Nieuw item voor ${title}`} className="input flex-1 py-1" />
              <SubmitButton className="btn-secondary py-1 text-xs">Toevoegen</SubmitButton>
            </form>
          </div>
        ))}
      </section>

      <section id="categorieen" className="scroll-mt-6">
        <h2 className="section-title mb-2">Leverancierscategorieën</h2>
        <div className="card p-4">
        <p className="text-sm text-muted">Deze categorieën ziet elk bruidspaar bij &quot;Jullie leveranciers&quot;, ook zolang er nog niets is ingevuld.</p>
        <ul className="mt-4 space-y-2">
          {categories.map((c) => (
            <li key={c.id} className={`flex flex-wrap items-center gap-2 ${c.archived ? "opacity-50" : ""}`}>
              <form action={saveCategory} className="flex flex-1 gap-2">
                <input type="hidden" name="categoryId" value={c.id} />
                <input name="name" defaultValue={c.name} required aria-label="Naam categorie" className="input py-1.5" />
                <SubmitButton className="btn-secondary py-1.5">Opslaan</SubmitButton>
              </form>
              <form action={archiveCategory}>
                <input type="hidden" name="categoryId" value={c.id} />
                <input type="hidden" name="archived" value={c.archived ? "0" : "1"} />
                <SubmitButton className="btn-ghost py-1.5 text-xs">{c.archived ? "Weer tonen" : "Verbergen"}</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
        <form action={saveCategory} className="mt-4 flex gap-2">
          <input name="name" required placeholder="Nieuwe categorie" aria-label="Nieuwe categorie" className="input py-1.5" />
          <SubmitButton className="btn-primary py-1.5">Toevoegen</SubmitButton>
        </form>
        </div>
      </section>

      <section id="groepsfotos" className="scroll-mt-6">
        <h2 className="section-title mb-2">Tekst bij de groepsfoto&apos;s</h2>
        <form action={saveGroupPhotoIntro} className="card space-y-3 p-4">
          <p className="text-xs text-muted">De eerste alinea is de kop van het inklapbare kader. Alinea&apos;s scheiden met een lege regel.</p>
          <AutoTextarea name="intro" defaultValue={settings.group_photo_intro} className="input" aria-label="Tekst bij de groepsfoto's" />
          <SubmitButton className="btn-primary">Opslaan</SubmitButton>
        </form>
      </section>
    </div>
  );
}
