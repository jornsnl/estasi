import Link from "next/link";
import { saveLayout } from "@/app/actions/ws-seating";
import { SubmitButton } from "@/components/SubmitButton";
import { SeatingEditor } from "@/components/ws/SeatingEditor";
import { groupsOf, type GuestGroup } from "@/lib/ws/rsvp";
import { layoutsFor, seatingState, type Layout } from "@/lib/ws/seating";

const SHAPES = { rows: "Rijen met middenpad", half: "Halve cirkel", circle: "Cirkel" } as const;

function LayoutForm({ coupleId, groups, layout, kind }: { coupleId: string; groups: GuestGroup[]; layout?: Layout; kind: "dinner" | "ceremony" }) {
  const k = layout?.id ?? `new-${kind}`;
  return (
    <form action={saveLayout} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="coupleId" value={coupleId} />
      <input type="hidden" name="kind" value={kind} />
      {layout && <input type="hidden" name="layoutId" value={layout.id} />}
      <div><label className="label" htmlFor={`n-${k}`}>Naam</label><input id={`n-${k}`} name="name" defaultValue={layout?.name ?? (kind === "dinner" ? "Dineropstelling" : "Ceremonieopstelling")} className="input" /></div>
      <fieldset>
        <legend className="label">Gastengroep(en)</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {groups.map((g) => (
            <label key={g.id} className="flex items-center gap-1.5">
              <input type="checkbox" name="groupIds" value={g.id} defaultChecked={layout ? layout.group_ids.includes(g.id) : g.kind === "day"} className="accent-[#6B1E2E]" /> {g.name}
            </label>
          ))}
        </div>
      </fieldset>
      {kind === "ceremony" && (
        <>
          <div>
            <label className="label" htmlFor={`s-${k}`}>Vorm</label>
            <select id={`s-${k}`} name="shape" defaultValue={layout?.shape ?? "rows"} className="input">
              {Object.entries(SHAPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label" htmlFor={`r-${k}`}>Rijen / ringen</label><input id={`r-${k}`} name="rows" type="number" min={1} max={40} defaultValue={layout?.rows ?? 6} className="input" /></div>
            <div><label className="label" htmlFor={`p-${k}`}>Stoelen per rij (per kant)</label><input id={`p-${k}`} name="seatsPerRow" type="number" min={1} max={40} defaultValue={layout?.seats_per_row ?? 6} className="input" /></div>
            {layout?.shape === "rows" && <p className="col-span-2 text-xs text-muted">Per rij en per kant instellen doe je bij &quot;Stoelen per rij&quot; onder de plattegrond. Een ander getal hier zet alle rijen gelijk.</p>}
          </div>
          <div><label className="label" htmlFor={`l-${k}`}>Label linkerkant</label><input id={`l-${k}`} name="sideLeft" defaultValue={layout?.side_left ?? ""} placeholder="Kant Estelle" className="input" /></div>
          <div><label className="label" htmlFor={`rr-${k}`}>Label rechterkant</label><input id={`rr-${k}`} name="sideRight" defaultValue={layout?.side_right ?? ""} placeholder="Kant Ramon" className="input" /></div>
        </>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton className="btn-primary py-1.5">{layout ? "Opslaan" : "Opstelling maken"}</SubmitButton>
        {layout && <SubmitButton name="intent" value="delete" className="btn-ghost py-1.5 text-bordeaux" confirm={`Weet je het zeker? "${layout.name}" wordt met alle plaatsen verwijderd.`}>Verwijderen</SubmitButton>}
      </div>
    </form>
  );
}

/** Dinner and ceremony seating, as a tab of the run sheet. */
export async function SeatingTab({ coupleId, layoutId }: { coupleId: string; isAdmin?: boolean; layoutId?: string }) {
  const [layouts, groups] = await Promise.all([layoutsFor(coupleId), groupsOf(coupleId)]);
  const current = layouts.find((l) => l.id === layoutId) ?? layouts[0];
  const state = current ? await seatingState(coupleId, current.id) : null;
  const base = `/k/${coupleId}/draaiboek?soort=seating`;
  return (
    <div className="space-y-4">
      {layouts.length > 1 && (
        <nav className="flex flex-wrap gap-1.5" aria-label="Opstellingen">
          {layouts.map((l) => (
            <Link key={l.id} href={`${base}&opstelling=${l.id}`} className={`rounded-full px-3 py-1 text-sm ${l.id === current?.id ? "bg-ink text-white" : "bg-white"}`}>{l.name}</Link>
          ))}
        </nav>
      )}
      {!current && <p className="card p-5 text-sm text-muted">Nog geen opstelling. Maak hieronder een dineropstelling of ceremonieopstelling.</p>}
      {current && state && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">{current.name}</h2>
            <a href={`/k/${coupleId}/draaiboek/print?tabs=seating:${current.id}&print=1`} target="_blank" rel="noopener" className="btn-secondary py-1.5">Download als PDF</a>
          </div>
          {/* Feedback Sabine (15): the couple makes and changes the layouts too. */}
          <SeatingEditor key={current.id} coupleId={coupleId} initial={state} canEditLayout />
          <details className="card p-4">
            <summary className="cursor-pointer text-sm font-medium text-bordeaux">Opstelling aanpassen</summary>
            <div className="mt-3"><LayoutForm coupleId={coupleId} groups={groups} layout={current} kind={current.kind} /></div>
          </details>
        </>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-medium text-bordeaux">+ Dineropstelling</summary>
          <div className="mt-3"><LayoutForm coupleId={coupleId} groups={groups} kind="dinner" /></div>
        </details>
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-medium text-bordeaux">+ Ceremonieopstelling</summary>
          <div className="mt-3"><LayoutForm coupleId={coupleId} groups={groups} kind="ceremony" /></div>
        </details>
      </div>
    </div>
  );
}

/** For the run sheet print: every plan, read only. */
export async function SeatingPrint({ coupleId, layoutId }: { coupleId: string; layoutId?: string }) {
  const layouts = (await layoutsFor(coupleId)).filter((l) => !layoutId || l.id === layoutId);
  const states = await Promise.all(layouts.map((l) => seatingState(coupleId, l.id)));
  return (
    <div className="space-y-6">
      {states.map((s) => s && (
        <div key={s.layout.id} className="break-inside-avoid">
          <h3 className="mb-1 text-sm font-semibold">{s.layout.name}</h3>
          <SeatingEditor coupleId={coupleId} initial={s} canEditLayout={false} readOnly />
        </div>
      ))}
    </div>
  );
}
