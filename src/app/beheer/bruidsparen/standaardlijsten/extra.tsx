import { saveDefaultPlaces } from "@/app/actions/ws-styling";
import { SubmitButton } from "@/components/SubmitButton";
import { AutoTextarea } from "@/components/ws/AutoTextarea";
import { getSettings } from "@/lib/ws/settings";
import { DefaultMeals } from "./meals";

/** Standard places of the styling plan and the meal moments. */
export async function DefaultsExtra() {
  const settings = await getSettings();
  return (
    <>
      <section id="plekken" className="scroll-mt-6">
        <h2 className="section-title mb-2">Plekken in het stylingplan</h2>
        <form action={saveDefaultPlaces} className="card space-y-3 p-4">
          <p className="text-xs text-muted">Eén plek per regel, in deze volgorde.</p>
          <AutoTextarea name="places" defaultValue={(settings.default_styling_places ?? []).join("\n")} aria-label="Standaardplekken" className="input" />
          <SubmitButton className="btn-primary">Opslaan</SubmitButton>
        </form>
      </section>
      <DefaultMeals />
    </>
  );
}
