import type { Metadata } from "next";
import Link from "next/link";
import { submitAcademySignup } from "@/app/actions/academy-signup";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { getStore } from "@/lib/data";
import { SIGNUP_PACKAGE_LABELS, SIGNUP_PACKAGES, SIGNUP_SITUATION_LABELS, SIGNUP_SITUATIONS } from "@/lib/pipeline/signup";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Word weddingplanner · Future Weddings Academy van Estasi Weddings" },
  description:
    "De online opleiding tot weddingplanner van Sabine van Estasi Weddings. Leer het vak, start je eigen bedrijf en loop mee op echte bruiloften. Schrijf je in voor een kennismaking.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://academy.estasiweddings.nl/inschrijven" },
  openGraph: {
    title: "Word weddingplanner met de Future Weddings Academy",
    description: "De online opleiding tot weddingplanner van Estasi Weddings. Schrijf je in voor een kennismaking met Sabine.",
    url: "https://academy.estasiweddings.nl/inschrijven",
    siteName: "Estasi Weddings",
    locale: "nl_NL",
    type: "website",
  },
};

const MODULES = [
  { title: "Het vak weddingplanner", text: "Wat doet een weddingplanner precies, en past dit vak bij jou?" },
  { title: "Ondernemen als weddingplanner", text: "Positionering, aanbod, prijzen en de basis van je eigen bedrijf." },
  { title: "De klantreis en intake", text: "Van eerste kennismaking tot een helder voorstel dat overtuigt." },
  { title: "Budget, planning en leveranciers", text: "Grip op geld, tijdlijnen en sterke samenwerkingen." },
  { title: "De trouwdag", text: "Draaiboek, coördinatie en rustig blijven als het anders loopt." },
  { title: "Zichtbaarheid en groei", text: "Marketing, netwerk en je volgende stap als planner." },
];

const STEPS = [
  { title: "Schrijf je in", text: "Laat via het formulier weten wie je bent en wat je zoekt. Het kost twee minuten en zit nergens aan vast." },
  { title: "Kennismaken met Sabine", text: "Sabine belt je binnen twee werkdagen. Samen kijken jullie welk pakket past en wanneer je start." },
  { title: "Start in de Academy", text: "Je krijgt een eigen account en begint direct met de eerste module, in je eigen tempo." },
  { title: "Certificaat", text: "Rond je de opleiding af, dan ontvang je het certificaat van de Future Weddings Academy." },
];

const FAQ = [
  {
    q: "Heb ik ervaring nodig?",
    a: "Nee. De opleiding begint bij de basis van het vak. Ben je al planner, dan haal je vooral veel uit de modules over ondernemen, de klantreis en groei.",
  },
  {
    q: "Hoeveel tijd kost de opleiding?",
    a: "Je bepaalt zelf het tempo. Elke module bestaat uit korte lessen met video, tekst en opdrachten die je naast je werk of studie kunt doen.",
  },
  {
    q: "Wat is het verschil tussen pakket A en B?",
    a: "Pakket A is de volledige online opleiding. Bij pakket B loop je daarnaast mee in de praktijk met Estasi Weddings en ontvang je ook het praktijkcertificaat.",
  },
  {
    q: "Krijg ik persoonlijke feedback?",
    a: "Ja. Sabine kijkt je opdrachten na en geeft persoonlijke feedback. Via de privéchat kun je haar ook tussendoor vragen stellen.",
  },
  {
    q: "Zit ik ergens aan vast als ik me inschrijf?",
    a: "Nee. Met je inschrijving vraag je een kennismaking aan. Pas daarna besluit je of je wilt starten.",
  },
];

const Check = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-gold">
    <path fill="currentColor" d="M8.1 13.6 4.5 10l-1.1 1.1 4.7 4.7 9-9-1.1-1.1z" />
  </svg>
);

const Ornament = () => (
  <div className="flex items-center justify-center gap-3 text-gold" aria-hidden="true">
    <span className="h-px w-10 bg-gold/50" />
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5"><path fill="currentColor" d="M12 2l2.4 7.6H22l-6.2 4.6 2.4 7.6L12 17.2l-6.2 4.6 2.4-7.6L2 9.6h7.6z" /></svg>
    <span className="h-px w-10 bg-gold/50" />
  </div>
);

/** Public landing page of the Academy with the sign up form. Every sign up becomes a lead in the salespipeline. */
export default async function InschrijvenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const thanks = params.bedankt === "1";
  const settings = await getStore()
    .getSettings()
    .catch(() => null);
  const spotsOpen = settings?.practicalSpotsAvailable ?? true;
  const spotsNote = settings?.practicalSpotsNote?.trim() ?? "";
  const contact = settings?.contactEmail?.trim() || "";

  return (
    <div className="bg-paper">
      {/* Top bar */}
      <header className="border-b border-line bg-white/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="leading-tight">
            <span className="block font-serif text-[22px] tracking-wide text-ink">Estasi Weddings</span>
            <span className="eyebrow mt-0.5 block text-[10px]">Future Weddings Academy</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-ghost hidden sm:inline-flex">Inloggen</Link>
            <a href="#aanmelden" className="btn-primary">Inschrijven</a>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-cream">
          <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-gold-soft" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-40 -left-24 h-80 w-80 rounded-full bg-bordeaux-soft" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1.2fr_1fr] md:items-center md:py-24">
            <div>
              <p className="eyebrow">Opleiding tot weddingplanner</p>
              <h1 className="mt-4 text-4xl leading-[1.1] sm:text-5xl md:text-6xl">
                Maak van jouw liefde voor bruiloften <span className="text-bordeaux italic">je vak</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-muted">
                In de Future Weddings Academy leert Sabine van Estasi Weddings je alles wat ze in de praktijk heeft geleerd: van het eerste
                kennismakingsgesprek tot de laatste dans. Online, in je eigen tempo, met persoonlijke feedback.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#aanmelden" className="btn-primary px-6 py-3 text-base">Schrijf je in</a>
                <a href="#programma" className="btn-secondary px-6 py-3 text-base">Bekijk het programma</a>
              </div>
              <p className="mt-4 text-sm text-muted">Vrijblijvend: je inschrijving start met een persoonlijke kennismaking.</p>
            </div>
            <div className="card relative p-8 shadow-sm">
              <Ornament />
              <ul className="mt-6 space-y-4 text-[15px]">
                {[
                  "6 modules, van het vak tot je eigen bedrijf",
                  "Opdrachten met persoonlijke feedback van Sabine",
                  "Community met andere (toekomstige) planners",
                  "Meelopen op echte bruiloften (pakket B)",
                  "Certificaat bij afronding",
                ].map((item) => (
                  <li key={item} className="flex gap-3"><Check />{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* For whom */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">Voor wie</p>
            <h2 className="mt-3 text-3xl sm:text-4xl">Herken jij jezelf hierin?</h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              { t: "Je droomt van dit vak", d: "Je regelt graag, houdt van details en wordt blij van andermans geluk. Je wilt weten of weddingplanning bij je past." },
              { t: "Je wilt starten", d: "Je bent klaar voor de stap naar een eigen bedrijf, maar wilt het goed doen: met een sterk aanbod en de juiste aanpak." },
              { t: "Je bent al planner", d: "Je hebt de eerste bruiloften gedaan en wilt groeien: professioneler werken, beter prijzen en meer zichtbaarheid." },
            ].map((c) => (
              <div key={c.t} className="card p-7">
                <h3 className="text-2xl text-bordeaux">{c.t}</h3>
                <p className="mt-3 leading-7 text-muted">{c.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Programme */}
        <section id="programma" className="scroll-mt-20 border-y border-line bg-cream/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">Het programma</p>
              <h2 className="mt-3 text-3xl sm:text-4xl">Zes modules, één compleet vak</h2>
              <p className="mt-4 text-muted">Elke module bestaat uit korte lessen met video, tekst en opdrachten. Rond je een module af, dan gaat de volgende open.</p>
            </div>
            <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {MODULES.map((m, i) => (
                <li key={m.title} className="card flex gap-5 p-6">
                  <span className="font-serif text-4xl leading-none text-gold">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="text-xl">{m.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-muted">{m.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Packages */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">Pakketten</p>
            <h2 className="mt-3 text-3xl sm:text-4xl">Kies wat bij jou past</h2>
          </div>
          <div className="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-2">
            <div className="card flex flex-col p-8">
              <p className="eyebrow">Pakket A</p>
              <h3 className="mt-2 text-3xl">Online</h3>
              <p className="mt-2 text-muted">De complete opleiding, waar en wanneer het jou uitkomt.</p>
              <ul className="mt-6 space-y-3 text-[15px]">
                {["Alle zes modules online", "Opdrachten met persoonlijke feedback", "Community en privéchat met Sabine", "Online certificaat"].map((i) => (
                  <li key={i} className="flex gap-3"><Check />{i}</li>
                ))}
              </ul>
              <a href="#aanmelden" className="btn-secondary mt-8">Inschrijven voor pakket A</a>
            </div>
            <div className="card relative flex flex-col border-bordeaux/40 p-8 shadow-sm ring-1 ring-bordeaux/10">
              <span className="absolute -top-3 right-6 rounded-full bg-bordeaux px-3 py-1 text-xs font-medium text-white">Meest compleet</span>
              <p className="eyebrow">Pakket B</p>
              <h3 className="mt-2 text-3xl">Online + praktijk</h3>
              <p className="mt-2 text-muted">Alles van pakket A, plus ervaring op echte bruiloften.</p>
              <ul className="mt-6 space-y-3 text-[15px]">
                {[
                  "Alles uit pakket A",
                  "Meelopen met Estasi Weddings in de praktijk",
                  "Meekijken in echte draaiboeken",
                  "Online én praktijkcertificaat",
                ].map((i) => (
                  <li key={i} className="flex gap-3"><Check />{i}</li>
                ))}
              </ul>
              {!spotsOpen && (
                <p className="mt-6 rounded-md bg-gold-soft px-3 py-2 text-sm text-gold-ink">
                  {spotsNote || "De praktijkplekken zijn op dit moment vol. Schrijf je in, dan hoor je als eerste wanneer er weer plek is."}
                </p>
              )}
              <a href="#aanmelden" className="btn-primary mt-8">Inschrijven voor pakket B</a>
            </div>
          </div>
          <p className="mt-6 text-center text-sm text-muted">Investering en startmoment bespreek je persoonlijk met Sabine tijdens de kennismaking.</p>
        </section>

        {/* About Sabine */}
        <section className="bg-bordeaux text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.4fr] md:items-center md:py-20">
            <div className="text-center md:text-left">
              <p className="text-xs font-semibold tracking-[0.14em] text-gold-soft uppercase">Je opleider</p>
              <h2 className="mt-3 text-4xl text-white sm:text-5xl">Sabine</h2>
              <p className="mt-2 font-serif text-xl text-gold-soft italic">Oprichter van Estasi Weddings</p>
            </div>
            <div className="space-y-4 text-[17px] leading-8 text-white/90">
              <p>
                Met Estasi Weddings begeleidt Sabine bruidsparen van het eerste idee tot de laatste dans. In de Academy deelt ze alles wat ze in die
                praktijk heeft geleerd: hoe je een bruiloft plant, hoe je met leveranciers samenwerkt en hoe je er een eigen bedrijf van maakt.
              </p>
              <p>
                Geen theorie uit een boek, maar de aanpak, documenten en lessen van een planner die het elk seizoen zelf doet. Met persoonlijke
                feedback op jouw opdrachten, zodat je echt groeit.
              </p>
            </div>
          </div>
        </section>

        {/* Steps */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">Zo werkt het</p>
            <h2 className="mt-3 text-3xl sm:text-4xl">Van inschrijving tot certificaat</h2>
          </div>
          <ol className="mt-12 grid gap-8 md:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-gold font-serif text-xl text-gold-ink">{i + 1}</span>
                <h3 className="mt-4 text-xl">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Sign up */}
        <section id="aanmelden" className="scroll-mt-4 border-t border-line bg-cream">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.3fr] md:py-20">
            <div>
              <p className="eyebrow">Inschrijven</p>
              <h2 className="mt-3 text-3xl sm:text-4xl">Zet de eerste stap</h2>
              <p className="mt-4 leading-7 text-muted">
                Vul het formulier in en Sabine neemt binnen twee werkdagen persoonlijk contact met je op voor een vrijblijvende kennismaking.
              </p>
              <ul className="mt-6 space-y-3 text-[15px]">
                {["Persoonlijk advies over het juiste pakket", "Al je vragen beantwoord", "Je zit nergens aan vast"].map((i) => (
                  <li key={i} className="flex gap-3"><Check />{i}</li>
                ))}
              </ul>
              {contact && (
                <p className="mt-8 text-sm text-muted">
                  Liever direct contact? Mail <a href={`mailto:${contact}`} className="text-bordeaux underline underline-offset-2">{contact}</a>
                </p>
              )}
            </div>

            <div className="card p-6 shadow-sm sm:p-8">
              {thanks ? (
                <div className="py-8 text-center" role="status">
                  <Ornament />
                  <h3 className="mt-6 text-3xl">Dank je wel!</h3>
                  <p className="mx-auto mt-3 max-w-sm leading-7 text-muted">
                    Je inschrijving is binnen. Je krijgt een bevestiging per e-mail en Sabine neemt binnen twee werkdagen contact met je op.
                  </p>
                </div>
              ) : (
                <form action={submitAcademySignup} className="space-y-5">
                  <Notice searchParams={searchParams} />
                  {/* Honeypot: people never see or fill this. */}
                  <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                    <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
                  </div>
                  <div>
                    <label className="label" htmlFor="name">Naam<span className="text-bordeaux" aria-hidden="true"> *</span></label>
                    <input id="name" name="name" required maxLength={120} autoComplete="name" className="input" />
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="email">E-mail<span className="text-bordeaux" aria-hidden="true"> *</span></label>
                      <input id="email" name="email" type="email" required maxLength={200} autoComplete="email" className="input" />
                    </div>
                    <div>
                      <label className="label" htmlFor="phone">Telefoonnummer<span className="text-bordeaux" aria-hidden="true"> *</span></label>
                      <input id="phone" name="phone" type="tel" required maxLength={40} autoComplete="tel" className="input" />
                    </div>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="city">Woonplaats</label>
                      <input id="city" name="city" maxLength={120} autoComplete="address-level2" className="input" />
                    </div>
                    <div>
                      <label className="label" htmlFor="situation">Waar sta je nu?</label>
                      <select id="situation" name="situation" className="input" defaultValue="">
                        <option value="">Kies wat past</option>
                        {SIGNUP_SITUATIONS.map((s) => <option key={s} value={s}>{SIGNUP_SITUATION_LABELS[s]}</option>)}
                      </select>
                    </div>
                  </div>
                  <fieldset>
                    <legend className="label">Welk pakket spreekt je aan?</legend>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {SIGNUP_PACKAGES.map((p) => (
                        <label key={p} className="flex cursor-pointer items-center gap-2 rounded-md border border-line bg-white px-3 py-2.5 text-sm has-[:checked]:border-bordeaux has-[:checked]:bg-bordeaux-soft">
                          <input type="radio" name="package" value={p} defaultChecked={p === "twijfel"} className="accent-bordeaux" />
                          {SIGNUP_PACKAGE_LABELS[p]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div>
                    <label className="label" htmlFor="motivation">Waarom wil je weddingplanner worden?</label>
                    <textarea id="motivation" name="motivation" rows={4} maxLength={3000} className="input" placeholder="Vertel iets over jezelf en wat je hoopt te leren." />
                  </div>
                  <div>
                    <label className="label" htmlFor="heardFrom">Hoe heb je ons gevonden?</label>
                    <input id="heardFrom" name="heardFrom" maxLength={200} className="input" placeholder="Bijvoorbeeld Instagram, Google of via een vriendin" />
                  </div>
                  <label className="flex items-start gap-3 text-sm text-muted">
                    <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 accent-bordeaux" />
                    <span>Estasi Weddings mag mijn gegevens gebruiken om contact met mij op te nemen over de Academy.<span className="text-bordeaux" aria-hidden="true"> *</span></span>
                  </label>
                  <SubmitButton className="btn-primary w-full py-3 text-base" pendingText="Bezig met versturen...">Inschrijven</SubmitButton>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 md:py-20">
          <div className="text-center">
            <p className="eyebrow">Veelgestelde vragen</p>
            <h2 className="mt-3 text-3xl sm:text-4xl">Goed om te weten</h2>
          </div>
          <div className="mt-10 divide-y divide-line border-y border-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-serif text-xl text-ink">
                  {f.q}
                  <span className="text-2xl text-gold transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className="mt-3 leading-7 text-muted">{f.a}</p>
              </details>
            ))}
          </div>
          <div className="mt-12 text-center">
            <a href="#aanmelden" className="btn-primary px-6 py-3 text-base">Schrijf je in</a>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} Estasi Weddings · Future Weddings Academy</p>
          <div className="flex gap-5">
            <a href="https://estasiweddings.nl" className="hover:text-ink">estasiweddings.nl</a>
            <Link href="/login" className="hover:text-ink">Inloggen cursisten</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
