import { addMealRow, addMoment, moveMoment } from "@/app/actions/ws-meals";
import { MoveButtons } from "@/components/MoveButtons";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { CopyButton, MealTable, MenuBlocks, PartOfDayList } from "@/components/ws/MealsBoard";
import { MomentToggle } from "@/components/ws/MomentToggle";
import { requirePlanning } from "@/lib/ws/access";
import { allergyList } from "@/lib/ws/allergies";
import { query } from "@/lib/ws/db";
import { coupleName, formatDate, formatDateTime } from "@/lib/ws/format";
import { mealsFor } from "@/lib/ws/meals";

export const metadata = { title: "Eten & allergieën" };

export default async function MealsPage({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coupleId } = await params;
  const { couple } = await requirePlanning(coupleId);
  const [{ moments, rows, guests, totals }, suppliers] = await Promise.all([
    mealsFor(couple.id),
    query<{ name: string }>("select distinct name from couple_suppliers where couple_id = $1 and name <> '' order by name", [couple.id]),
  ]);
  const allergies = allergyList(guests, rows);
  const partial = guests.filter((g) => g.attendance === "partial");
  const copyText = [
    `Allergieën en dieetwensen, bruiloft ${coupleName(couple)}${couple.wedding_date ? ` op ${formatDate(couple.wedding_date)}` : ""}`,
    "",
    ...allergies.map((a) => `${a.name}${a.kid ? " (kind)" : ""}: ${a.diet}`),
  ].join("\n");
  const plainMoments = moments.map((m) => ({
    id: m.id, name: m.name, active: m.active, at_time: m.at_time, caterer: m.caterer, menu: m.menu,
    updated: m.updated_at ? `Laatst aangepast door ${m.updated_by_name || "onbekend"}, ${formatDateTime(m.updated_at)}` : "",
  }));
  const hidden = <input type="hidden" name="coupleId" value={couple.id} />;

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Onderdeel</p>
        <h1 className="mt-1 text-3xl">Eten & allergieën</h1>
        <p className="mt-1 text-sm text-muted">Wat wordt er wanneer gegeten, en wie eet er mee. De aantallen van de RSVP-groepen en de allergieën uit de RSVP vullen zich vanzelf.</p>
      </header>
      <Notice searchParams={searchParams} />

      <section>
        <h2 className="section-title mb-1">Wat wordt er gegeten</h2>
        <MenuBlocks coupleId={couple.id} moments={plainMoments} caterers={suppliers.map((s) => s.name)} />
      </section>

      <section id="tabel" className="scroll-mt-6 space-y-3">
        <h2 className="section-title">Wie eet er mee</h2>
        <MealTable
          coupleId={couple.id}
          moments={plainMoments}
          totals={totals}
          rows={rows.map((r) => ({ id: r.id, kind: r.kind, name: r.name, role: r.role, diet: r.diet, summary: r.summary, cells: r.cells }))}
        />
        <div className="flex flex-wrap gap-4">
          <form action={addMealRow} className="flex flex-wrap gap-2">
            {hidden}
            <input type="hidden" name="kind" value="person" />
            <input name="name" required list="caterers" placeholder="Persoon, bijvoorbeeld: Sabine" aria-label="Naam persoon" className="input w-48 py-1.5" />
            <input name="role" placeholder="Rol, bijvoorbeeld: fotograaf" aria-label="Rol" className="input w-44 py-1.5" />
            <SubmitButton className="btn-secondary py-1.5">+ Persoon</SubmitButton>
          </form>
          <form action={addMealRow} className="flex flex-wrap gap-2">
            {hidden}
            <input type="hidden" name="kind" value="group" />
            <input name="name" required placeholder="Eigen groep, bijvoorbeeld: Eigen kinderen" aria-label="Naam groep" className="input w-64 py-1.5" />
            <SubmitButton className="btn-secondary py-1.5">+ Groep</SubmitButton>
          </form>
        </div>
      </section>

      <details className="card p-5" open={allergies.length > 0 && allergies.length <= 12}>
        <summary className="cursor-pointer section-title">Allergieën en dieetwensen (uit de RSVP) ({allergies.length})</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton text={copyText} />
          <a href={`/k/${couple.id}/eten/print?print=1`} target="_blank" rel="noopener" className="btn-secondary py-1.5 text-xs">PDF</a>
        </div>
        <ul className="mt-3 divide-y divide-line text-sm">
          {allergies.map((a, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>{a.name}{a.kid && <span className="ml-1 rounded-full bg-gold-soft px-1.5 text-[10px] text-gold-ink">kind</span>} <span className="text-xs text-muted">{a.group}</span></span>
              <span>{a.diet}</span>
            </li>
          ))}
          {allergies.length === 0 && <li className="py-2 text-muted">Nog geen allergieën of dieetwensen.</li>}
        </ul>
      </details>

      <details className="card p-5" open={partial.some((g) => !g.meals_reviewed)}>
        <summary className="cursor-pointer section-title">Deel van de dag aanwezig (uit de RSVP) ({partial.length})</summary>
        <p className="mt-2 text-sm text-muted">Vink per gast uit bij welke eetmomenten hij of zij er niet is: het aantal van de groep en de allergieën passen zich vanzelf aan.</p>
        {partial.length > 0 ? (
          <PartOfDayList
            coupleId={couple.id}
            moments={plainMoments}
            guests={partial.map((g) => ({ id: g.id, name: g.name, group: g.group, is_kid: g.is_kid, partial_note: g.partial_note, reviewed: g.meals_reviewed, excluded: g.excluded }))}
          />
        ) : (
          <p className="mt-2 text-sm text-muted">Niemand.</p>
        )}
      </details>

      <section id="momenten" className="card scroll-mt-6 p-5">
        <h2 className="text-lg">Eetmomenten</h2>
        <p className="mt-1 text-sm text-muted">Zet aan wat van toepassing is, pas namen aan of voeg een moment toe.</p>
        <ul className="mt-3 space-y-1.5">
          {moments.map((m, i) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-cream px-3 py-1.5 text-sm">
              <MomentToggle coupleId={couple.id} momentId={m.id} active={m.active} name={m.name} />
              <MoveButtons action={moveMoment} id={m.id} first={i === 0} last={i === moments.length - 1} extra={{ coupleId: couple.id }} />
            </li>
          ))}
        </ul>
        <form action={addMoment} className="mt-3 flex gap-2">
          {hidden}
          <input name="name" required placeholder="Nieuw eetmoment" aria-label="Nieuw eetmoment" className="input max-w-xs py-1.5" />
          <SubmitButton className="btn-secondary py-1.5">Toevoegen</SubmitButton>
        </form>
      </section>
    </div>
  );
}

