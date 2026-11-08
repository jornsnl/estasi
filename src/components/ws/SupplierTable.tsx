"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addSupplierRow, deleteCoupleCategory, deleteSupplierRow, saveSupplierField, type SupplierField } from "@/app/actions/ws-suppliers";
import { AutoTextarea } from "@/components/ws/AutoTextarea";
import { SupplierQuickNav } from "@/components/ws/SupplierQuickNav";
import { categoryFilled, showRecommendationBar, type SupplierRowLike } from "@/lib/ws/recommendations";

type Status = "tbd" | "favorite" | "talking" | "booked" | "not_needed";

export interface SupplierRowData {
  id: string;
  category_id: string;
  category_name: string;
  category_own: boolean;
  status: Status;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  notes: string;
  present_from: string;
  present_until: string;
  documents: number;
}

const STATUS: Record<Status, string> = {
  tbd: "Nog te bepalen",
  favorite: "Huidige favoriet",
  talking: "In gesprek",
  booked: "Staat vast",
  not_needed: "Niet nodig",
};
const TONE: Record<Status, string> = {
  tbd: "bg-cream text-muted",
  favorite: "bg-bordeaux-soft text-bordeaux",
  talking: "bg-[#f3eedb] text-gold-ink",
  booked: "bg-success-soft text-success",
  not_needed: "bg-[#ecebe8] text-muted",
};

/**
 * "Jullie leveranciers": every field can be typed in directly and is saved
 * as soon as you leave it. Sabine and the couple can both do everything.
 */
export function SupplierTable({
  coupleId,
  rows,
  recommendations,
}: {
  coupleId: string;
  rows: SupplierRowData[];
  /** Visible recommendations per category id. */
  recommendations: Record<string, number>;
}) {
  // What the rows hold now (status and name change while typing), for the dots and the bar.
  const [live, setLive] = useState<Record<string, SupplierRowLike>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, { status: r.status, name: r.name }])),
  );
  const report = (id: string, change: Partial<SupplierRowLike>) =>
    setLive((current) => ({ ...current, [id]: { ...(current[id] ?? { status: "tbd", name: "" }), ...change } }));
  const categories = rows.reduce<{ id: string; name: string; own: boolean; rows: SupplierRowData[] }[]>((acc, row) => {
    const last = acc[acc.length - 1];
    if (last && last.id === row.category_id) last.rows.push(row);
    else acc.push({ id: row.category_id, name: row.category_name, own: row.category_own, rows: [row] });
    return acc;
  }, []);

  const current = (cat: (typeof categories)[number]) => cat.rows.map((r) => live[r.id] ?? { status: r.status, name: r.name });

  return (
    <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-6">
      <SupplierQuickNav categories={categories.map((cat) => ({ id: cat.id, name: cat.name, filled: categoryFilled(current(cat)) }))} />
      <div className="space-y-3">
        {categories.map((cat) => (
          <section key={cat.id} id={`c-${cat.id}`} className="scroll-mt-20 lg:scroll-mt-6">
            {cat.rows.map((row, n) => (
              <Row key={row.id} coupleId={coupleId} row={row} first={n === 0} report={report} />
            ))}
            {showRecommendationBar(current(cat), recommendations[cat.id] ?? 0) && (
              <RecommendationBar href={`/k/${coupleId}/leveranciers/aanraders?categorie=${cat.id}`} />
            )}
            <div className="flex flex-wrap gap-3 px-1 pt-1 text-xs">
              <form action={addSupplierRow}>
                <input type="hidden" name="coupleId" value={coupleId} />
                <input type="hidden" name="categoryId" value={cat.id} />
                <button type="submit" className="text-muted hover:text-bordeaux">+ Nog een {cat.name.toLowerCase()}</button>
              </form>
              {cat.own && (
                <form action={deleteCoupleCategory} onSubmit={(e) => { if (!confirm(`Categorie "${cat.name}" met alles erin verwijderen?`)) e.preventDefault(); }}>
                  <input type="hidden" name="coupleId" value={coupleId} />
                  <input type="hidden" name="categoryId" value={cat.id} />
                  <button type="submit" className="text-muted hover:text-bordeaux">Eigen categorie verwijderen</button>
                </form>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** "Twijfel je nog?": the whole bordeaux bar opens the recommendations of this category. */
export function RecommendationBar({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-bordeaux px-4 py-3 text-cream shadow-sm transition-colors hover:bg-[#561725] focus-visible:outline-offset-2"
    >
      <span className="text-sm sm:text-base">
        <span className="font-serif font-semibold">Twijfel je nog?</span> Bekijk de aanraders van Estasi
      </span>
      <span aria-hidden="true" className="text-lg">→</span>
    </Link>
  );
}

function Row({
  coupleId,
  row,
  first,
  report,
}: {
  coupleId: string;
  row: SupplierRowData;
  first: boolean;
  report: (id: string, change: Partial<SupplierRowLike>) => void;
}) {
  const [status, setStatus] = useState<Status>(row.status);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [, start] = useTransition();

  function save(field: SupplierField, value: string) {
    setState("saving");
    start(async () => {
      const result = await saveSupplierField(coupleId, row.id, field, value);
      setState(result.ok ? "saved" : "error");
      if (result.ok && (field === "status" || field === "name")) report(row.id, { [field]: value });
      setError(result.error ?? "");
    });
  }
  const input = (field: Exclude<SupplierField, "status" | "notes">, label: string, value: string, type = "text") => (
    <label className="block text-xs text-muted">
      {label}
      <input
        type={type}
        defaultValue={value}
        onBlur={(e) => e.target.value !== e.target.defaultValue && (save(field, e.target.value), (e.target.defaultValue = e.target.value))}
        className="input mt-0.5 py-1.5 text-sm text-ink"
      />
    </label>
  );

  return (
    <div className={`card mb-2 p-4 transition-colors ${status === "not_needed" ? "bg-[#f1f0ee] opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={`font-serif text-lg font-semibold ${first ? "" : "text-muted"}`}>{row.category_name}</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted" aria-live="polite">
            {state === "saving" ? "Opslaan…" : state === "saved" ? "✓ Opgeslagen" : state === "error" ? <span className="text-red-700">{error || "Niet opgeslagen"}</span> : ""}
          </span>
          <select
            aria-label={`Status ${row.category_name}`}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Status);
              save("status", e.target.value);
            }}
            className={`rounded-full border-0 px-3 py-1 text-xs font-medium ${TONE[status]}`}
          >
            {Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {input("name", "Leverancier", row.name)}
        {input("contact_person", "Contactpersoon", row.contact_person)}
        {input("phone", "Telefoon", row.phone, "tel")}
        {input("email", "E-mail", row.email, "email")}
      </div>
      {/* Arrival and departure show up in the day planning of the draaiboek. */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
        {input("present_from", "Aanwezig op locatie vanaf", row.present_from, "time")}
        {input("present_until", "Aanwezig op locatie tot", row.present_until, "time")}
      </div>
      <label className="mt-3 block text-xs text-muted">
        Opmerkingen
        <AutoTextarea
          defaultValue={row.notes}
          onBlur={(e) => e.target.value !== e.target.defaultValue && (save("notes", e.target.value), (e.target.defaultValue = e.target.value))}
          className="input mt-0.5 py-1.5 text-sm text-ink"
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <Link href={`/k/${coupleId}/leveranciers/${row.id}`} className="text-xs text-bordeaux hover:underline">
          Details & documenten{row.documents > 0 ? ` (${row.documents})` : ""}
        </Link>
        {!first && (
          <form action={deleteSupplierRow} onSubmit={(e) => { if (!confirm("Deze leverancier verwijderen?")) e.preventDefault(); }}>
            <input type="hidden" name="coupleId" value={coupleId} />
            <input type="hidden" name="supplierId" value={row.id} />
            <button type="submit" className="text-xs text-muted hover:text-bordeaux">Verwijderen</button>
          </form>
        )}
      </div>
    </div>
  );
}
