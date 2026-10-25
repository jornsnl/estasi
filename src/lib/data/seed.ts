import { hashPassword } from "@/lib/auth/password";
import { addMonths } from "@/lib/domain/access";
import type { LocalDb } from "./local-store";
import type { Answer, Block, Enrollment, Lesson, Module, Profile, User } from "./types";

/**
 * Demo content for local development. The lesson texts are placeholders:
 * the real course content still has to be written by Estasi.
 */

export const DEMO_PASSWORD = "academy-demo";

const day = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * day).toISOString();

const VIDEO = "https://player.vimeo.com/video/76979871";

const q = (
  id: string,
  kind: "open" | "reflection" | "practice",
  prompt: string,
  extra: Partial<{ helpText: string; required: boolean; feedback: boolean }> = {},
): Block => ({
  id,
  type: "question",
  kind,
  prompt,
  helpText: extra.helpText ?? "",
  required: extra.required ?? true,
  feedback: extra.feedback ?? false,
});

const text = (id: string, markdown: string): Block => ({ id, type: "text", markdown });
const video = (id: string, caption: string): Block => ({ id, type: "video", url: VIDEO, caption });

const modules: Module[] = [
  { id: "mod-1", position: 1, title: "Het vak weddingplanner", description: "Wat doet een weddingplanner precies, en past dit vak bij jou?" },
  { id: "mod-2", position: 2, title: "Ondernemen als weddingplanner", description: "Positionering, aanbod en de basis van je eigen bedrijf." },
  { id: "mod-3", position: 3, title: "De klantreis en intake", description: "Van eerste kennismaking tot een helder voorstel." },
  { id: "mod-4", position: 4, title: "Budget, planning en leveranciers", description: "Grip op geld, tijdlijnen en samenwerkingen." },
  { id: "mod-5", position: 5, title: "De trouwdag", description: "Draaiboek, coördinatie en omgaan met het onverwachte." },
  { id: "mod-6", position: 6, title: "Zichtbaarheid en groei", description: "Marketing, netwerk en je volgende stap." },
];

const lessons: Lesson[] = [
  {
    id: "les-1-1", moduleId: "mod-1", position: 1, title: "Welkom in de Academy", summary: "Kennismaken met de opleiding en met jezelf als planner.",
    blocks: [
      video("b-1-1-1", "Een persoonlijk welkom."),
      text("b-1-1-2", "Fijn dat je er bent. In deze eerste les maak je kennis met de opbouw van de Academy.\n\n**Zo werkt elke les:** je kijkt de video, leest de tekst en beantwoordt daarna de vragen direct op deze pagina. Je antwoorden worden bewaard en je kunt ze later altijd teruglezen en aanpassen.\n\n*Voorbeeldtekst: de definitieve lesinhoud volgt.*"),
      q("b-1-1-3", "reflection", "Waarom wil jij weddingplanner worden?", { helpText: "Schrijf vrijuit, er is geen goed of fout antwoord." }),
      q("b-1-1-4", "open", "Welke ervaring neem je al mee (werk, studie, vrijwilligerswerk)?", { required: false }),
    ],
  },
  {
    id: "les-1-2", moduleId: "mod-1", position: 2, title: "Een dag uit het leven van een planner", summary: "De taken achter de schermen.",
    blocks: [
      video("b-1-2-1", "Achter de schermen bij een bruiloft."),
      text("b-1-2-2", "Een groot deel van het werk gebeurt lang vóór de trouwdag: overleggen, plannen, offertes vergelijken en verwachtingen managen.\n\n*Voorbeeldtekst.*"),
      { id: "b-1-2-3", type: "choice", prompt: "Welk onderdeel van het werk spreekt jou het meest aan?", helpText: "", options: ["Creatief concept en styling", "Planning en organisatie", "Contact met het bruidspaar", "Coördinatie op de dag zelf"], required: true, feedback: false },
      q("b-1-2-4", "reflection", "Welk onderdeel vind je nu nog spannend, en waarom?"),
    ],
  },
  {
    id: "les-2-1", moduleId: "mod-2", position: 1, title: "Jouw positionering", summary: "Voor wie ben jij de ideale planner?",
    blocks: [
      video("b-2-1-1", "Positionering in de trouwbranche."),
      text("b-2-1-2", "Een heldere positionering helpt je de juiste bruidsparen aan te trekken.\n\n*Voorbeeldtekst.*"),
      { id: "b-2-1-3", type: "download", label: "Werkblad positionering", description: "Optioneel hulpmiddel om je gedachten te ordenen.", url: "https://estasiweddings.nl", file: null },
      q("b-2-1-4", "practice", "Beschrijf je ideale bruidspaar in vijf tot tien zinnen.", { feedback: true, helpText: "Sabine geeft persoonlijk feedback op deze opdracht. Je kunt ondertussen gewoon verder." }),
    ],
  },
  {
    id: "les-2-2", moduleId: "mod-2", position: 2, title: "Je aanbod en prijzen", summary: "Pakketten samenstellen die bij je passen.",
    blocks: [
      text("b-2-2-1", "Welke diensten ga je aanbieden: volledige planning, gedeeltelijke planning of dagcoördinatie?\n\n*Voorbeeldtekst.*"),
      q("b-2-2-2", "practice", "Schets je eerste aanbod: welke pakketten en wat zit erin?", { feedback: true }),
    ],
  },
  {
    id: "les-3-1", moduleId: "mod-3", position: 1, title: "Het kennismakingsgesprek", summary: "Een sterke eerste indruk.",
    blocks: [
      video("b-3-1-1", "Een intakegesprek in de praktijk."),
      text("b-3-1-2", "*Voorbeeldtekst over het voorbereiden en voeren van een intake.*"),
      q("b-3-1-3", "practice", "Stel tien vragen op die jij in een intake zou stellen."),
    ],
  },
  {
    id: "les-3-2", moduleId: "mod-3", position: 2, title: "Van intake naar voorstel", summary: "Een voorstel dat overtuigt.",
    blocks: [
      text("b-3-2-1", "*Voorbeeldtekst over het opstellen van een voorstel.*"),
      { id: "b-3-2-2", type: "upload", prompt: "Upload een eerste opzet van je voorstel (optioneel).", helpText: "Pdf of Word, maximaal 10 MB.", required: false, feedback: true },
      q("b-3-2-3", "reflection", "Wat vond je lastig aan het schrijven van een voorstel?"),
    ],
  },
  {
    id: "les-4-1", moduleId: "mod-4", position: 1, title: "Budgetbeheer", summary: "Overzicht houden over de kosten.",
    blocks: [text("b-4-1-1", "*Voorbeeldtekst over budgetten.*"), q("b-4-1-2", "practice", "Maak een globale budgetverdeling voor een bruiloft van 80 gasten.")],
  },
  {
    id: "les-4-2", moduleId: "mod-4", position: 2, title: "Werken met leveranciers", summary: "Samenwerken en afspraken maken.",
    blocks: [text("b-4-2-1", "*Voorbeeldtekst over leveranciers.*"), q("b-4-2-2", "open", "Welke leveranciers wil jij als eerste in je netwerk hebben?")],
  },
  {
    id: "les-5-1", moduleId: "mod-5", position: 1, title: "Het draaiboek", summary: "Alles op papier, minuut voor minuut.",
    blocks: [video("b-5-1-1", "Een draaiboek doorlopen."), text("b-5-1-2", "*Voorbeeldtekst over draaiboeken.*"), q("b-5-1-3", "practice", "Schrijf het draaiboek voor de ochtend van een trouwdag.", { feedback: true })],
  },
  {
    id: "les-5-2", moduleId: "mod-5", position: 2, title: "Als het anders loopt", summary: "Rustig blijven als het spannend wordt.",
    blocks: [text("b-5-2-1", "*Voorbeeldtekst over improviseren.*"), q("b-5-2-2", "reflection", "Hoe reageer jij onder druk? Geef een voorbeeld.")],
  },
  {
    id: "les-6-1", moduleId: "mod-6", position: 1, title: "Zichtbaar worden", summary: "Je eerste marketingstappen.",
    blocks: [text("b-6-1-1", "*Voorbeeldtekst over marketing.*"), q("b-6-1-2", "practice", "Welke drie kanalen ga je gebruiken en waarom?")],
  },
  {
    id: "les-6-2", moduleId: "mod-6", position: 2, title: "Je volgende stap", summary: "Afronden en vooruitkijken.",
    blocks: [text("b-6-2-1", "*Voorbeeldtekst om af te sluiten.*"), q("b-6-2-2", "reflection", "Wat zijn je ondernemersdoelen voor het komende jaar?")],
  },
];

function user(id: string, name: string, email: string, role: User["role"], password: string, lastActiveDaysAgo: number | null): User {
  return {
    id,
    name,
    email,
    role,
    passwordHash: hashPassword(password),
    setupToken: null,
    setupTokenExpiresAt: null,
    createdAt: ago(200),
    lastActiveAt: lastActiveDaysAgo === null ? null : ago(lastActiveDaysAgo),
  };
}

function profile(userId: string, city: string, extra: Partial<Profile> = {}): Profile {
  return {
    userId,
    phone: "",
    city,
    companyName: "",
    photoFileId: null,
    instagram: "",
    website: "",
    intro: "",
    goals: "",
    updatedAt: ago(30),
    ...extra,
  };
}

function enrollment(id: string, userId: string, pkg: "A" | "B", purchasedDaysAgo: number, extra: Partial<Enrollment> = {}): Enrollment {
  const purchasedAt = ago(purchasedDaysAgo);
  return {
    id,
    userId,
    package: pkg,
    purchasedAt,
    endsAt: addMonths(purchasedAt, 12),
    pausedAt: null,
    pauses: [],
    revokedAt: null,
    onlineCompletedAt: null,
    certificateReleasedAt: null,
    certificateCode: null,
    practicalStatus: "none",
    ownerNotes: "",
    ...extra,
  };
}

function answer(userId: string, lessonId: string, blockId: string, value: string, daysAgo: number): Answer {
  return {
    id: `ans-${userId}-${blockId}`,
    userId,
    lessonId,
    blockId,
    text: value,
    choice: null,
    files: [],
    version: 1,
    createdAt: ago(daysAgo),
    updatedAt: ago(daysAgo),
  };
}

export function createSeed(): LocalDb {
  const owner = user("user-owner", "Sabine", "sabine@estasiweddings.nl", "owner", DEMO_PASSWORD, 1);
  const lotte = user("user-lotte", "Lotte de Vries", "lotte@voorbeeld.nl", "student", DEMO_PASSWORD, 2);
  const noor = user("user-noor", "Noor Jansen", "noor@voorbeeld.nl", "student", DEMO_PASSWORD, 5);
  const eva = user("user-eva", "Eva Bakker", "eva@voorbeeld.nl", "student", DEMO_PASSWORD, 400);

  const lotteAnswers = [
    answer(lotte.id, "les-1-1", "b-1-1-3", "Ik organiseer al jaren feesten voor vrienden en familie en merk dat ik er energie van krijg om alles tot in de puntjes te regelen.", 40),
    answer(lotte.id, "les-1-2", "b-1-2-4", "Het contact met leveranciers vind ik nog spannend, omdat ik daar nog weinig ervaring mee heb.", 35),
    { ...answer(lotte.id, "les-1-2", "b-1-2-3", "", 35), choice: "Planning en organisatie" },
    answer(lotte.id, "les-2-1", "b-2-1-4", "Mijn ideale bruidspaar is tussen de 28 en 38, houdt van een intieme bruiloft in de natuur en waardeert rust en persoonlijke aandacht.", 10),
  ];

  const allLessonIds = lessons.map((l) => l.id);

  return {
    users: [owner, lotte, noor, eva],
    profiles: [
      profile(lotte.id, "Utrecht", { intro: "Eventmanager in opleiding.", goals: "Binnen een jaar mijn eerste vijf bruiloften plannen." }),
      profile(noor.id, "Haarlem", { companyName: "Noor Events" }),
      profile(eva.id, "Zwolle"),
    ],
    enrollments: [
      enrollment("enr-lotte", lotte.id, "A", 45),
      enrollment("enr-noor", noor.id, "B", 120),
      enrollment("enr-eva", eva.id, "A", 400),
    ],
    modules,
    lessons,
    answers: [
      ...lotteAnswers,
      answer(noor.id, "les-2-1", "b-2-1-4", "Stellen die een stijlvolle stadsbruiloft willen en weinig tijd hebben om alles zelf te regelen.", 90),
      answer(noor.id, "les-5-1", "b-5-1-3", "08:00 visagie bruid, 09:30 fotograaf aanwezig, 10:30 first look in het park, 11:30 vertrek naar het stadhuis.", 60),
    ],
    feedback: [],
    completions: [
      { userId: lotte.id, lessonId: "les-1-1", completedAt: ago(40) },
      { userId: lotte.id, lessonId: "les-1-2", completedAt: ago(35) },
      ...allLessonIds.map((lessonId, i) => ({ userId: noor.id, lessonId, completedAt: ago(100 - i * 5) })),
    ],
    audit: [],
    files: [],
    settings: {
      welcomeVideoUrl: VIDEO,
      welcomeText: "Welkom bij de Wedding Plan Academy. Neem rustig de tijd voor elke les: je antwoorden worden bewaard en je kunt ze altijd later aanpassen.",
      contactEmail: process.env.CONTACT_EMAIL ?? "academy@estasiweddings.nl",
      practicalSpotsAvailable: false,
      practicalSpotsNote: "",
      answersPrivacyNotice: "Je antwoorden zijn alleen zichtbaar voor jou en voor je opleider. Zij gebruikt ze voor begeleiding, feedback en het vaststellen van je afronding. Andere cursisten kunnen je antwoorden nooit zien.",
    },
  };
}
