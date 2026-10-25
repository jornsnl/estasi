import { formatDate } from "@/lib/util/format";

export function Certificate({ name, date, code }: { name: string; date: string; code: string }) {
  return (
    <div className="mx-auto aspect-[1.414] w-full max-w-4xl bg-white p-3 shadow-sm print:shadow-none">
      <div className="flex h-full flex-col items-center justify-center border border-gold p-8 text-center outline outline-1 outline-offset-4 outline-gold/40 sm:p-14">
        <p className="eyebrow">Estasi Weddings</p>
        <p className="mt-2 font-serif text-2xl text-gold-ink">Wedding Plan Academy</p>
        <h1 className="mt-6 text-4xl sm:text-6xl">Certificaat</h1>
        <p className="mt-6 text-sm tracking-wide text-muted uppercase">uitgereikt aan</p>
        <p className="mt-2 font-serif text-3xl text-bordeaux sm:text-5xl">{name}</p>
        <p className="mt-6 max-w-lg text-muted">
          voor het succesvol afronden van het online deel van de opleiding tot weddingplanner.
        </p>
        <div className="mt-10 flex w-full max-w-lg items-end justify-between text-left text-sm">
          <div>
            <p className="font-serif text-xl">Sabine</p>
            <p className="border-t border-line pt-1 text-muted">Opleider, Estasi Weddings</p>
          </div>
          <div className="text-right">
            <p>{formatDate(date)}</p>
            <p className="text-xs text-muted">Certificaatnummer {code}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
