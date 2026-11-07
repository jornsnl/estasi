import { saveDefaultMoments } from "@/app/actions/ws-meals";
import { SubmitButton } from "@/components/SubmitButton";
import { AutoTextarea } from "@/components/ws/AutoTextarea";
import { query } from "@/lib/ws/db";

/** Standard meal moments every new couple starts with. */
export async function DefaultMeals() {
  const moments = await query<{ name: string }>("select name from default_meal_moments order by position");
  return (
    <section id="eetmomenten" className="scroll-mt-6">
      <h2 className="section-title mb-2">Eetmomenten</h2>
      <form action={saveDefaultMoments} className="card space-y-3 p-4">
        <p className="text-xs text-muted">Eén eetmoment per regel, in deze volgorde.</p>
        <AutoTextarea name="moments" defaultValue={moments.map((m) => m.name).join("\n")} aria-label="Standaard eetmomenten" className="input" />
        <SubmitButton className="btn-primary">Opslaan</SubmitButton>
      </form>
    </section>
  );
}
