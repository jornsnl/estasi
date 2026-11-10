import Link from "next/link";
import type { PreviewTarget } from "@/lib/academy-preview";
import type { User } from "@/lib/data";

/**
 * The bar on top of "Bekijk als cursist": who the pages are shown for, a choice
 * of a new student per package or a real student, and the pages to look at.
 */
export function PreviewBar({ target, students, active }: { target: PreviewTarget; students: User[]; active: "dashboard" | "opleiding" | "les" }) {
  const value = target.student ? target.student.id : `pakket-${target.pkg}`;
  const tab = (key: typeof active, href: string, label: string) => (
    <Link
      href={`${href}?${target.query}`}
      aria-current={active === key ? "page" : undefined}
      // A lesson belongs to Mijn opleiding, as in the student menu.
      className={`rounded-full px-3 py-1 ${active === key || (active === "les" && key === "opleiding") ? "bg-bordeaux text-white" : "text-ink hover:text-bordeaux"}`}
    >
      {label}
    </Link>
  );
  return (
    <div className="no-print sticky top-0 z-10 -mx-4 mb-8 space-y-3 border-b border-gold/40 bg-gold-soft/95 px-4 py-3 text-sm backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
      <p>
        <strong>Bekijk als cursist.</strong>{" "}
        {target.student
          ? `Zo ziet ${target.student.name} deze pagina, met de eigen voortgang en antwoorden.`
          : `Zo ziet een nieuwe cursist van pakket ${target.pkg} deze pagina: nog niets gedaan, de eerste module staat open.`}{" "}
        Hier wordt niets opgeslagen of ingediend.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Pagina's van de cursist" className="flex flex-wrap gap-1">
          {tab("dashboard", "/beheer/voorbeeld", "Dashboard")}
          {tab("opleiding", "/beheer/voorbeeld/opleiding", "Mijn opleiding")}
        </nav>
        {/* Plain GET form: the choice goes into the address, so a preview can be bookmarked or shared with yourself. */}
        <form action="/beheer/voorbeeld" className="flex flex-wrap items-center gap-2">
          <label htmlFor="voorbeeld-wie" className="sr-only">Bekijken als</label>
          <select id="voorbeeld-wie" name="wie" defaultValue={value} className="input w-auto py-1.5">
            <option value="pakket-A">Nieuwe cursist, pakket A</option>
            <option value="pakket-B">Nieuwe cursist, pakket B</option>
            {students.length > 0 && (
              <optgroup label="Een cursist">
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </optgroup>
            )}
          </select>
          <button type="submit" className="btn-secondary px-3 py-1.5">Bekijken</button>
        </form>
      </div>
    </div>
  );
}
