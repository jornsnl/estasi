"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addSupplierRow, deleteCoupleCategory, deleteSupplierRow, saveSupplierField, type SupplierField } from "@/app/actions/ws-suppliers";
import { AutoTextarea } from "@/components/ws/AutoTextarea";

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
const RECOMMEND: Status[] = ["tbd", "favorite", "talking"];

/**
 * "Jullie leveranciers": every field can be typed in directly and is saved
 * as soon as you leave it. Sabine and the couple can both do everything.
 */
export function SupplierTable({ coupleId, rows }: { coupleId: string; rows: SupplierRowData[] }) {
  const categories = rows.reduce<{ id: string; name: string; own: boolean; rows: SupplierRowData[] }[]>((acc, row) => {
    const last = acc[acc.length - 1];
    if (last && last.id === row.category_id) last.rows.push(row);
    else acc.push({ id: row.category_id, name: row.category_name, own: row.category_own, rows: [row] });
    return acc;
  }, []);

  return (
    <div className="space-y-3">
      {categories.map((cat) => (
        <section key={cat.id} id={`c-${cat.id}`} className="scroll-mt-6">
          {cat.rows.map((row, n) => (
            <Row key={row.id} coupleId={coupleId} row={row} first={n === 0} />
          ))}
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
  );
}

function Row({ coupleId, row, first }: { coupleId: string; row: SupplierRowData; first: boolean }) {
  const [status, setStatus] = useState<Status>(row.status);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [, start] = useTransition();

  function save(field: SupplierField, value: string) {
    setState("saving");
    start(async () => {
      const result = await saveSupplierField(coupleId, row.id, field, value);
      setState(result.ok ? "saved" : "error");
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
        {RECOMMEND.includes(status) && (
          <Link href={`/k/${coupleId}/leveranciers/aanraders?categorie=${row.category_id}`} className="btn-secondary py-1.5 text-xs">
            ♡ Bekijk Estasi aanraders
          </Link>
        )}
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
