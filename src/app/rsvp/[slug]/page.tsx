import { Notice } from "@/components/Notice";
import { metadataIcons } from "@/lib/brand-logo-urls";
import { RsvpFormClient } from "@/components/ws/RsvpFormClient";
import { coupleName, formatDate } from "@/lib/ws/format";
import { fillTemplate, MAX_RELATIONS, publicForm, relationOptions } from "@/lib/ws/rsvp";

export const dynamic = "force-dynamic";
// Guests see the logo of Estasi Weddings, like the couple.
export const metadata = { title: "RSVP", robots: { index: false, follow: false }, icons: metadataIcons("estasi") };

/** The public RSVP page a guest opens from the invitation (link or QR code). No login. */
export default async function RsvpPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const found = await publicForm(slug);
  const thanks = (await searchParams).bedankt;

  if (!found) {
    return (
      <main className="ws-theme flex flex-col items-center px-4 pt-32 text-center">
        <h1 className="text-3xl">Dit formulier is niet (meer) beschikbaar</h1>
        <p className="mt-2 text-muted">Neem contact op met het bruidspaar.</p>
      </main>
    );
  }
  const { form, couple, questions } = found;
  const names = coupleName(couple);
  const date = couple.wedding_date ? formatDate(couple.wedding_date) : "";
  const photo = form.header_file_id || couple.cover_file_id;
  const intro = fillTemplate(form.intro, { namen: names, datum: date || "de trouwdag" });

  return (
    <main className="ws-theme pb-10">
      {/* Header: the form's own photo, else the couple's cover, else a calm cream header with the logo. */}
      {photo ? (
        <section className="relative h-56 w-full overflow-hidden sm:h-72">
          {/* eslint-disable-next-line @next/next/no-img-element -- served after checking the form is open */}
          <img
            src={`/rsvp/${form.slug}/cover`}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: `50% ${form.header_file_id ? form.header_position : 50}%` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-black/5" />
          <div className="absolute inset-x-0 bottom-6 px-4 text-center text-white">
            <p className="text-[11px] tracking-[0.2em] uppercase opacity-90">Jullie zijn uitgenodigd</p>
            <h1 className="mt-1 text-3xl text-white sm:text-4xl">{names}</h1>
            {(date || couple.location) && <p className="mt-1 text-sm opacity-90">{date}{couple.location ? ` · ${couple.location}` : ""}</p>}
          </div>
        </section>
      ) : (
        <section className="border-b border-line bg-cream-deep/60 px-4 py-10 text-center">
          <p className="font-serif text-xl tracking-wide">Estasi Weddings</p>
          <h1 className="mt-4 text-3xl sm:text-4xl">{names}</h1>
          {(date || couple.location) && <p className="mt-1 text-sm text-muted">{date}{couple.location ? ` · ${couple.location}` : ""}</p>}
        </section>
      )}

      <div className="mx-auto mt-6 max-w-lg px-4">
        {thanks ? (
          <div className="card p-8 text-center">
            <h2 className="text-2xl">{thanks === "nee" ? "Bedankt voor het laten weten" : "Dank je wel!"}</h2>
            <p className="mt-2 text-muted">
              {thanks === "nee" ? "Jammer dat je er niet bij kunt zijn. Je antwoord is goed ontvangen." : "Je aanmelding is goed ontvangen. Je krijgt een bevestiging per e-mail."}
            </p>
          </div>
        ) : (
          <div className="card space-y-4 p-6">
            <h2 className="text-xl">{form.name}</h2>
            {intro && <p className="text-sm whitespace-pre-line text-muted">{intro}</p>}
            <Notice searchParams={searchParams} />
            <RsvpFormClient
              slug={form.slug}
              relations={relationOptions(couple)}
              maxRelations={MAX_RELATIONS}
              askPartOfDay={form.ask_part_of_day}
              askDiet={form.ask_diet}
              askDresscode={form.ask_dresscode && Boolean(form.dresscode)}
              dresscode={form.dresscode}
              dresscodeNote={form.dresscode_note}
              questions={questions.map((q) => ({
                id: q.id,
                label: q.label,
                help: q.help,
                kind: q.kind,
                required: q.required,
                options: Array.isArray(q.options) ? q.options : [],
                max_choices: q.max_choices,
                show_if_question_id: q.show_if_question_id,
                show_if_value: q.show_if_value,
              }))}
            />
          </div>
        )}
      </div>
    </main>
  );
}
