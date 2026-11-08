import { addMonths } from "@/lib/domain/access";
import type {
  AssignmentAnswers,
  AssignmentBlock,
  AuditEntry,
  Block,
  Enrollment,
  Lesson,
  LessonCompletion,
  Module,
  Profile,
  Settings,
  Submission,
  SubmissionVersion,
  User,
} from "./types";

/**
 * Demo content for local development (scripts/seed-dev.ts puts it in the
 * database) and the example course of scripts/supabase-setup.ts. The lesson
 * texts are placeholders: the real course content still has to be written by
 * Estasi. Ids are readable ("mod-1", "user-lotte"); the scripts turn them into
 * uuids. Pure data: no imports from the server side.
 */

/** Password of every demo account (development login only). */
export const DEMO_PASSWORD = "academy-demo";

export interface SeedData {
  users: User[];
  profiles: Profile[];
  enrollments: Enrollment[];
  modules: Module[];
  lessons: Lesson[];
  submissions: Submission[];
  versions: SubmissionVersion[];
  completions: LessonCompletion[];
  audit: AuditEntry[];
  settings: Settings;
}

const day = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * day).toISOString();

const VIDEO = "https://player.vimeo.com/video/76979871";

/** An assignment with one long text answer (the shape migration 0025 gives the old questions). */
const q = (
  id: string,
  _kind: "open" | "reflection" | "practice",
  prompt: string,
  extra: Partial<{ helpText: string; required: boolean; feedback: boolean }> = {},
): AssignmentBlock => one(id, { id: `${id}-f1`, type: "long", label: prompt, help: extra.helpText ?? "", required: extra.required ?? true }, extra);

function one(id: string, field: AssignmentBlock["parts"][number]["fields"][number], extra: Partial<{ required: boolean; feedback: boolean }> = {}): AssignmentBlock {
  return {
    id,
    type: "assignment",
    title: "",
    intro: "",
    requiredForLesson: extra.required ?? true,
    feedbackAllowed: extra.feedback ?? false,
    graded: false,
    repeatOf: null,
    parts: [{ id: `${id}-p1`, title: "", intro: "", fields: [field] }],
  };
}

/** The ten competences of the competence scan (Academy 7). */
export const COMPETENCES = [
  "Plannen en organiseren",
  "Communiceren",
  "Stressbestendigheid",
  "Probleemoplossend vermogen",
  "Gastvrijheid en empathie",
  "Leiderschap",
  "Creativiteit",
  "Grenzen stellen",
  "Samenwerken",
  "Commercieel inzicht",
];

const SCORE_EXPLANATION = [
  "1 = Dit vind ik nog lastig; hier heb ik weinig ervaring mee.",
  "2 = Ik heb hier wat ervaring mee, maar voel me nog onzeker.",
  "3 = Dit gaat me redelijk af; soms heb ik nog hulp nodig.",
  "4 = Dit gaat me goed af; ik doe het meestal zelfstandig.",
  "5 = Dit is een van mijn sterke kanten; ik kan anderen hierin helpen.",
].join("\n");

function competenceScan(id: string, title: string, intro: string, repeatOf: string | null): AssignmentBlock {
  return {
    id,
    type: "assignment",
    title,
    intro,
    requiredForLesson: true,
    feedbackAllowed: false,
    graded: false,
    repeatOf,
    parts: [
      {
        id: `${id}-p1`,
        title: "",
        intro: "",
        fields: [
          {
            // Same field and row ids in both scans, so the two measurements line up.
            id: "scan-competenties",
            type: "scale_rows",
            label: "Hoe sterk ben je op dit moment in deze competenties?",
            help: "Kies per competentie een score van 1 tot 5. Er zijn geen goede of foute antwoorden.",
            required: true,
            min: 1,
            max: 5,
            minLabel: "nog lastig",
            maxLabel: "sterke kant",
            explanation: SCORE_EXPLANATION,
            mode: "score",
            rows: COMPETENCES.map((label, i) => ({ id: `comp-${i + 1}`, label })),
          },
          {
            id: "scan-toelichting",
            type: "long",
            label: "Welke competentie wil je tijdens de opleiding het meest ontwikkelen, en waarom?",
            help: "",
            required: false,
          },
        ],
      },
    ],
  };
}

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
      one("b-1-2-3", { id: "b-1-2-3-f1", type: "single", label: "Welk onderdeel van het werk spreekt jou het meest aan?", help: "", required: true, options: ["Creatief concept en styling", "Planning en organisatie", "Contact met het bruidspaar", "Coördinatie op de dag zelf"], allowComment: false }),
      q("b-1-2-4", "reflection", "Welk onderdeel vind je nu nog spannend, en waarom?"),
    ],
  },
  {
    id: "les-1-3", moduleId: "mod-1", position: 3, title: "Competentiescan", summary: "Waar sta je nu? Aan het eind van de opleiding doe je dezelfde scan nog een keer.",
    blocks: [
      text("b-1-3-1", "Met deze scan breng je in kaart waar je nu staat. Aan het einde van de opleiding vul je dezelfde scan opnieuw in en zie je je beide scores naast elkaar.\n\n*Voorbeeldtekst.*"),
      competenceScan("b-1-3-2", "Competentiescan (beginmeting)", "Lees eerst de uitleg bij de scores en kies daarna per competentie een score.", null),
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
      one("b-3-2-2", { id: "b-3-2-2-f1", type: "upload", label: "Upload een eerste opzet van je voorstel (optioneel).", help: "Pdf of Word, maximaal 10 MB.", required: false, accept: ["pdf", "docx"], maxFiles: 3 }, { required: false, feedback: true }),
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
    blocks: [
      text("b-6-2-1", "*Voorbeeldtekst om af te sluiten.*"),
      q("b-6-2-2", "reflection", "Wat zijn je ondernemersdoelen voor het komende jaar?"),
      competenceScan("b-6-2-3", "Competentiescan (eindmeting)", "Vul dezelfde scan nog een keer in. Onder de scan zie je je scores van het begin van de opleiding ernaast.", "b-1-3-2"),
    ],
  },
];

function user(id: string, name: string, email: string, role: User["role"], lastActiveDaysAgo: number | null): User {
  return {
    id,
    name,
    email,
    role,
    activatedAt: ago(200),
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
    practicalCertificateReleasedAt: null,
    practicalCertificateCode: null,
    ownerNotes: "",
    ...extra,
  };
}

const textAnswer = (blockId: string, value: string): AssignmentAnswers => ({ [`${blockId}-f1`]: { text: value } });

const scanAnswer = (scores: number[], note = ""): AssignmentAnswers => ({
  "scan-competenties": { rows: Object.fromEntries(scores.map((s, i) => [`comp-${i + 1}`, s])) },
  ...(note ? { "scan-toelichting": { text: note } } : {}),
});

const block = (blockId: string) => lessons.flatMap((l) => l.blocks).find((b): b is AssignmentBlock => b.id === blockId && b.type === "assignment")!;

/** A student's work on one assignment; submitted (with version 1) or a draft. Ids are readable; the scripts make uuids. */
function work(
  userId: string,
  lessonId: string,
  blockId: string,
  answers: AssignmentAnswers,
  daysAgo: number,
  opts: { submitted?: boolean; feedback?: boolean } = {},
): { submission: Submission; version: SubmissionVersion | null } {
  const at = ago(daysAgo);
  const submission: Submission = {
    id: `sub-${userId}-${blockId}`,
    userId,
    lessonId,
    blockId,
    status: opts.submitted ? "ingediend" : "concept",
    draft: answers,
    draftVersion: 1,
    feedbackRequested: opts.feedback ?? false,
    questionForSabine: "",
    submittedAt: opts.submitted ? at : null,
    createdAt: at,
    updatedAt: at,
  };
  const version: SubmissionVersion | null = opts.submitted
    ? {
        id: `ver-${userId}-${blockId}-1`,
        submissionId: submission.id,
        userId,
        version: 1,
        answers,
        assignment: block(blockId),
        feedbackRequested: opts.feedback ?? false,
        questionForSabine: "",
        feedbackStatus: opts.feedback ? "nieuw" : null,
        submittedAt: at,
      }
    : null;
  return { submission, version };
}

export function createSeed(): SeedData {
  const owner = user("user-owner", "Sabine", "sabine@estasiweddings.nl", "owner", 1);
  const lotte = user("user-lotte", "Lotte de Vries", "lotte@voorbeeld.nl", "student", 2);
  const noor = user("user-noor", "Noor Jansen", "noor@voorbeeld.nl", "student", 5);
  const eva = user("user-eva", "Eva Bakker", "eva@voorbeeld.nl", "student", 400);

  const allWork = [
    work(lotte.id, "les-1-1", "b-1-1-3", textAnswer("b-1-1-3", "Ik organiseer al jaren feesten voor vrienden en familie en merk dat ik er energie van krijg om alles tot in de puntjes te regelen."), 40, { submitted: true }),
    work(lotte.id, "les-1-2", "b-1-2-4", textAnswer("b-1-2-4", "Het contact met leveranciers vind ik nog spannend, omdat ik daar nog weinig ervaring mee heb."), 35, { submitted: true }),
    work(lotte.id, "les-1-2", "b-1-2-3", { "b-1-2-3-f1": { choice: "Planning en organisatie" } }, 35, { submitted: true }),
    work(lotte.id, "les-1-3", "b-1-3-2", scanAnswer([4, 3, 3, 4, 5, 2, 4, 2, 4, 2], "Grenzen stellen: ik zeg nog te snel ja."), 33, { submitted: true }),
    work(lotte.id, "les-2-1", "b-2-1-4", textAnswer("b-2-1-4", "Mijn ideale bruidspaar is tussen de 28 en 38, houdt van een intieme bruiloft in de natuur en waardeert rust en persoonlijke aandacht."), 10, { feedback: true }),
    work(noor.id, "les-1-3", "b-1-3-2", scanAnswer([3, 4, 3, 3, 4, 3, 5, 2, 4, 3]), 98, { submitted: true }),
    work(noor.id, "les-2-1", "b-2-1-4", textAnswer("b-2-1-4", "Stellen die een stijlvolle stadsbruiloft willen en weinig tijd hebben om alles zelf te regelen."), 90, { submitted: true, feedback: true }),
    work(noor.id, "les-5-1", "b-5-1-3", textAnswer("b-5-1-3", "08:00 visagie bruid, 09:30 fotograaf aanwezig, 10:30 first look in het park, 11:30 vertrek naar het stadhuis."), 60, { submitted: true, feedback: true }),
    work(noor.id, "les-6-2", "b-6-2-3", scanAnswer([4, 5, 4, 4, 5, 4, 5, 3, 5, 4], "Ik durf nu veel beter nee te zeggen."), 46, { submitted: true }),
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
    // The example course is published and meant for both packages.
    modules: modules.map((m) => ({ ...m, status: "published" as const, packages: "AB" as const })),
    lessons: lessons.map((l) => ({ ...l, status: "published" as const, draft: null, publishedAt: null })),
    submissions: allWork.map((w) => w.submission),
    versions: allWork.flatMap((w) => (w.version ? [w.version] : [])),
    completions: [
      { userId: lotte.id, lessonId: "les-1-1", completedAt: ago(40) },
      { userId: lotte.id, lessonId: "les-1-2", completedAt: ago(35) },
      { userId: lotte.id, lessonId: "les-1-3", completedAt: ago(33) },
      ...allLessonIds.map((lessonId, i) => ({ userId: noor.id, lessonId, completedAt: ago(100 - i * 5) })),
    ],
    audit: [],
    settings: {
      welcomeVideoUrl: VIDEO,
      welcomeText: "Welkom bij de Wedding Plan Academy. Neem rustig de tijd voor elke les: je antwoorden worden bewaard en je kunt ze altijd later aanpassen.",
      contactEmail: process.env.CONTACT_EMAIL ?? "academy@estasiweddings.nl",
      practicalSpotsAvailable: false,
      practicalSpotsNote: "",
      privacyText: "",
      answersPrivacyNotice: "Je antwoorden zijn alleen zichtbaar voor jou en voor je opleider. Zij gebruikt ze voor begeleiding, feedback en het vaststellen van je afronding. Andere cursisten kunnen je antwoorden nooit zien.",
    },
  };
}
