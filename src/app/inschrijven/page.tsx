import type { Metadata } from "next";
import Link from "next/link";
import { submitAcademySignup } from "@/app/actions/academy-signup";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { getStore } from "@/lib/data";
import { SIGNUP_PACKAGE_LABELS, SIGNUP_PACKAGES, SIGNUP_SITUATION_LABELS, SIGNUP_SITUATIONS } from "@/lib/pipeline/signup";
import { getSignupPage, type SignupPage } from "@/lib/signup-page";

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

const Check = ({ tone = "text-gold" }: { tone?: string }) => (
  <svg viewBox="0 0 20 20" aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${tone}`}>
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

const photo = (id: string) => `/api/inschrijven/foto/${id}`;

/** Sabine's logo (uploaded in Instellingen, Inschrijfpagina); until then the Estasi monogram. */
function BrandLogo({ fileId, className }: { fileId: string | null | undefined; className: string }) {
  if (fileId) {
    // eslint-disable-next-line @next/next/no-img-element -- uploaded logo, may be an SVG
    return <img src={photo(fileId)} alt="Logo Future Weddings Academy" className={`${className} object-contain`} />;
  }
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Logo Future Weddings Academy" className={className}>
      <circle cx="32" cy="32" r="30.5" fill="#6b1e2e" stroke="#a89650" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="26" fill="none" stroke="#e8d9a8" strokeOpacity="0.5" strokeWidth="0.8" />
      <text x="32" y="43" textAnchor="middle" fontFamily="'Playfair Display',Georgia,serif" fontSize="30" fontWeight="600" fill="#e8d9a8">E</text>
    </svg>
  );
}

/** Public landing page of the Academy with the sign up form. Every sign up becomes a lead in the salespipeline. */
export default async function InschrijvenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const thanks = params.bedankt === "1";
  const [settings, page] = await Promise.all([
    getStore()
      .getSettings()
      .catch(() => null),
    getSignupPage().catch((): SignupPage | null => null),
  ]);
  const spotsOpen = settings?.practicalSpotsAvailable ?? true;
  const spotsNote = settings?.practicalSpotsNote?.trim() ?? "";
  const contact = settings?.contactEmail?.trim() || "";
  const reviewPhotos = [page?.review_photo1_file_id, page?.review_photo2_file_id].filter((id): id is string => Boolean(id));

  return (
    // Feedback Sabine: less cream, more of the house colours bordeaux #6B1E2E and gold green #A89650, still clean.
    <div className="signup-theme bg-paper">
      {/* Top bar: "Future Weddings Academy" large, Estasi Weddings small below it, with the logo. */}
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="#top" className="flex min-w-0 items-center gap-3">
            <BrandLogo fileId={page?.logo_file_id} className="h-11 w-11 shrink-0 sm:h-12 sm:w-12" />
            <span className="min-w-0 leading-tight">
              <span className="block font-serif text-xl text-bordeaux sm:text-[26px]">Future Weddings Academy</span>
              <span className="eyebrow mt-0.5 block text-[10px]">Estasi Weddings</span>
            </span>
          </a>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/login" className="btn-ghost hidden sm:inline-flex">Inloggen</Link>
            <a href="#aanmelden" className="btn-primary">Inschrijven</a>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="relative overflow-hidden bg-bordeaux text-white">
          <div className="pointer-events-none absolute -top-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-gold/25" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-48 -left-32 h-96 w-96 rounded-full bg-white/5" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1.25fr_1fr] md:items-center md:py-24">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-gold-light uppercase">Opleiding tot weddingplanner</p>
              <h1 className="mt-4 text-4xl leading-[1.1] text-white sm:text-5xl md:text-6xl">
                Maak van jouw liefde voor bruiloften <span className="text-gold-light italic">je vak</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-white/85">
                In de Future Weddings Academy leert Sabine van Estasi Weddings je alles wat ze in de praktijk heeft geleerd: van het eerste
                kennismakingsgesprek tot de laatste dans. Online, in je eigen tempo, met persoonlijke feedback.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#aanmelden" className="btn-gold px-6 py-3 text-base">Schrijf je in</a>
                <a href="#programma" className="btn border border-white/40 px-6 py-3 text-base text-white hover:bg-white/10">Bekijk het programma</a>
              </div>
              <p className="mt-4 text-sm text-white/70">Vrijblijvend: je inschrijving start met een persoonlijke kennismaking.</p>
            </div>
            {/* The logo in a circle, a little tilted, so it stands out. */}
            <div className="flex justify-center md:justify-end">
              <div className="relative -rotate-[8deg]">
                <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-full bg-gold/60" aria-hidden="true" />
                <div className="relative flex h-60 w-60 items-center justify-center rounded-full border-[6px] border-gold bg-white shadow-xl sm:h-72 sm:w-72 lg:h-80 lg:w-80">
                  <div className="absolute inset-3 rounded-full border border-gold/40" aria-hidden="true" />
                  <BrandLogo fileId={page?.logo_file_id} className="h-[62%] w-[62%]" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* What you get, on gold green */}
        <section className="bg-gold text-ink">
          <ul className="mx-auto grid max-w-6xl gap-x-8 gap-y-3 px-4 py-6 text-[15px] font-medium sm:grid-cols-2 sm:px-6 lg:grid-cols-5">
            {[
              "6 modules, van het vak tot je eigen bedrijf",
              "Opdrachten met persoonlijke feedback van Sabine",
              "Community met andere (toekomstige) planners",
              "Meelopen op echte bruiloften (pakket B)",
              "Certificaat bij afronding",
            ].map((item) => (
              <li key={item} className="flex gap-2.5"><Check tone="text-white" />{item}</li>
            ))}
          </ul>
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
              <div key={c.t} className="card border-t-4 border-t-gold p-7">
                <h3 className="text-2xl text-bordeaux">{c.t}</h3>
                <p className="mt-3 leading-7 text-muted">{c.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Programme */}
        <section id="programma" className="scroll-mt-20 bg-bordeaux-soft">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">Het programma</p>
              <h2 className="mt-3 text-3xl sm:text-4xl">Zes modules, één compleet vak</h2>
              <p className="mt-4 text-muted">Elke module bestaat uit korte lessen met video, tekst en opdrachten. Rond je een module af, dan gaat de volgende open.</p>
            </div>
            <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {MODULES.map((m, i) => (
                <li key={m.title} className="card flex gap-5 p-6">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bordeaux font-serif text-lg text-white">{i + 1}</span>
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
            <div className="card flex flex-col border-t-4 border-t-gold p-8">
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
            <div className="card relative flex flex-col border-t-4 border-bordeaux/40 border-t-bordeaux p-8 shadow-sm ring-1 ring-bordeaux/10">
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

        {/* About Sabine, with her photo in a circle */}
        <section className="bg-bordeaux text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.4fr] md:items-center md:py-20">
            <div className="flex flex-col items-center gap-6 text-center md:items-start md:text-left">
              {page?.trainer_photo_file_id ? (
                // eslint-disable-next-line @next/next/no-img-element -- photo of Sabine, uploaded in the beheer
                <img src={photo(page.trainer_photo_file_id)} alt="Sabine, oprichter van Estasi Weddings" className="h-44 w-44 rounded-full border-4 border-gold object-cover shadow-lg sm:h-52 sm:w-52" />
              ) : (
                <span className="flex h-44 w-44 items-center justify-center rounded-full border-4 border-gold bg-white/10 font-serif text-6xl text-gold-light sm:h-52 sm:w-52" aria-hidden="true">S</span>
              )}
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-gold-light uppercase">Je opleider</p>
                <h2 className="mt-3 text-4xl text-white sm:text-5xl">Sabine</h2>
                <p className="mt-2 font-serif text-xl text-gold-light italic">Oprichter van Estasi Weddings</p>
              </div>
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
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-gold bg-bordeaux font-serif text-xl text-white">{i + 1}</span>
                <h3 className="mt-4 text-xl">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Review with two photos (filled in by Sabine), under "Zo werkt het" */}
        {page?.review_text && (
          <section aria-labelledby="review-titel" className="bg-gold text-ink">
            <div className={`mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:items-center md:py-20 ${reviewPhotos.length ? "md:grid-cols-[1fr_1.2fr]" : ""}`}>
              {reviewPhotos.length > 0 && (
                <div className={`grid gap-4 ${reviewPhotos.length === 2 ? "grid-cols-2" : "mx-auto max-w-xs grid-cols-1"}`}>
                  {reviewPhotos.map((id, i) => (
                    // eslint-disable-next-line @next/next/no-img-element -- review photo, uploaded in the beheer
                    <img
                      key={id}
                      src={photo(id)}
                      alt=""
                      className={`aspect-[3/4] w-full rounded-2xl border-4 border-white object-cover shadow-lg ${reviewPhotos.length === 2 ? (i === 0 ? "-rotate-2" : "mt-8 rotate-2") : ""}`}
                    />
                  ))}
                </div>
              )}
              <figure className={reviewPhotos.length ? "" : "mx-auto max-w-3xl text-center"}>
                <p id="review-titel" className="text-xs font-semibold tracking-[0.14em] text-ink uppercase">Ervaring van een cursist</p>
                <span className="mt-2 block font-serif text-7xl leading-none text-white" aria-hidden="true">“</span>
                <blockquote className="-mt-4 space-y-4 font-serif text-xl leading-relaxed text-ink sm:text-2xl">
                  {page.review_text.split(/\n\s*\n/).map((para, i) => <p key={i} className="whitespace-pre-line">{para}</p>)}
                </blockquote>
                {page.review_name && <figcaption className="mt-6 text-sm font-semibold tracking-wide text-ink">{page.review_name}</figcaption>}
              </figure>
            </div>
          </section>
        )}

        {/* Sign up */}
        <section id="aanmelden" className="scroll-mt-20 bg-bordeaux text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.3fr] md:py-20">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-gold-light uppercase">Inschrijven</p>
              <h2 className="mt-3 text-3xl text-white sm:text-4xl">Zet de eerste stap</h2>
              <p className="mt-4 leading-7 text-white/85">
                Vul het formulier in en Sabine neemt binnen twee werkdagen persoonlijk contact met je op voor een vrijblijvende kennismaking.
              </p>
              <ul className="mt-6 space-y-3 text-[15px]">
                {["Persoonlijk advies over het juiste pakket", "Al je vragen beantwoord", "Je zit nergens aan vast"].map((i) => (
                  <li key={i} className="flex gap-3"><Check tone="text-gold-light" />{i}</li>
                ))}
              </ul>
              {contact && (
                <p className="mt-8 text-sm text-white/80">
                  Liever direct contact? Mail <a href={`mailto:${contact}`} className="text-white underline underline-offset-2">{contact}</a>
                </p>
              )}
            </div>

            <div className="card p-6 text-ink shadow-xl sm:p-8">
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

      <footer className="border-t-4 border-gold bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} Future Weddings Academy · Estasi Weddings</p>
          <div className="flex gap-5">
            <a href="https://estasiweddings.nl" className="hover:text-ink">estasiweddings.nl</a>
            <Link href="/login" className="hover:text-ink">Inloggen cursisten</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
