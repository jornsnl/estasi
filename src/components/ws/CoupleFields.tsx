import type { Couple } from "@/lib/ws/types";

/** The couple's personal details, shared by "Nieuw bruidspaar" and "Gegevens & delen". */
export function CoupleFields({ couple }: { couple?: Couple }) {
  const partner = (n: 1 | 2) => {
    const c = couple as unknown as Record<string, string> | undefined;
    const v = (f: string) => c?.[`partner${n}_${f}`] ?? "";
    return (
      <fieldset className="space-y-3">
        <legend className="mb-2 font-serif text-lg font-semibold">Partner {n}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor={`p${n}f`}>Voornaam</label><input id={`p${n}f`} name={`partner${n}First`} defaultValue={v("first")} required={n === 1} className="input" /></div>
          <div><label className="label" htmlFor={`p${n}l`}>Achternaam</label><input id={`p${n}l`} name={`partner${n}Last`} defaultValue={v("last")} className="input" /></div>
          <div><label className="label" htmlFor={`p${n}e`}>E-mail</label><input id={`p${n}e`} name={`partner${n}Email`} type="email" defaultValue={v("email")} className="input" /></div>
          <div><label className="label" htmlFor={`p${n}t`}>Telefoon</label><input id={`p${n}t`} name={`partner${n}Phone`} type="tel" defaultValue={v("phone")} className="input" /></div>
        </div>
      </fieldset>
    );
  };
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {partner(1)}
        {partner(2)}
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-serif text-lg font-semibold">Bruiloft</legend>
        <div><label className="label" htmlFor="weddingDate">Trouwdatum</label><input id="weddingDate" name="weddingDate" type="date" defaultValue={couple?.wedding_date ?? ""} className="input" /></div>
        <div><label className="label" htmlFor="location">Trouwlocatie</label><input id="location" name="location" defaultValue={couple?.location ?? ""} className="input" /></div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="dateUnconfirmed" defaultChecked={couple ? !couple.wedding_date_confirmed : false} className="accent-[#6B1E2E]" /> Datum nog niet bevestigd
        </label>
        <div className="sm:col-span-2"><label className="label" htmlFor="address">Adres bruidspaar</label><input id="address" name="address" defaultValue={couple?.address ?? ""} className="input" /></div>
      </fieldset>
    </div>
  );
}
