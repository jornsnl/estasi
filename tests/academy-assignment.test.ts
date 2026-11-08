import { describe, expect, it } from "vitest";
import type { AssignmentBlock, AssignmentField, LegacyBlock } from "@/lib/data/types";
import { createSeed, COMPETENCES } from "@/lib/data/seed";
import {
  acceptFor,
  answersAsText,
  cleanAnswers,
  cleanAssignment,
  compareScans,
  feedbackRequestAllowed,
  isFieldAnswered,
  legacyToAssignment,
  lessonCompletion,
  missingRequiredFields,
  newAssignment,
  newField,
  normaliseBlocks,
  sameAnswers,
  uploadKindOf,
  uploadProblem,
} from "@/lib/domain/assignment";

let n = 0;
const makeId = () => `id${++n}`;

const assignment: AssignmentBlock = {
  id: "opdr",
  type: "assignment",
  title: "Moodboard",
  intro: "",
  requiredForLesson: true,
  feedbackAllowed: true,
  graded: false,
  repeatOf: null,
  parts: [
    {
      id: "p1",
      title: "Onderdeel 1",
      intro: "",
      fields: [
        { id: "kort", type: "short", label: "Naam", help: "", required: true },
        { id: "lang", type: "long", label: "Toelichting", help: "", required: false },
        { id: "een", type: "single", label: "Stijl", help: "", required: true, options: ["Klassiek", "Boho"], allowComment: true },
        { id: "meer", type: "multi", label: "Kleuren", help: "", required: false, options: ["Goud", "Bordeaux", "Crème"], allowComment: false },
      ],
    },
    {
      id: "p2",
      title: "Onderdeel 2",
      intro: "",
      fields: [
        { id: "schaal", type: "scale", label: "Hoe tevreden?", help: "", required: true, min: 1, max: 5, minLabel: "", maxLabel: "", explanation: "" },
        {
          id: "rijen",
          type: "scale_rows",
          label: "Scan",
          help: "",
          required: true,
          min: 1,
          max: 5,
          minLabel: "",
          maxLabel: "",
          explanation: "",
          mode: "score",
          rows: [
            { id: "r1", label: "Plannen" },
            { id: "r2", label: "Communiceren" },
          ],
        },
        { id: "upl", type: "upload", label: "Moodboard", help: "", required: true, accept: ["pdf", "jpg", "png"], maxFiles: 2 },
      ],
    },
  ],
};

const file = (id: string) => ({ id, name: `${id}.pdf`, size: 10, mime: "application/pdf" });

describe("opdracht opbouwen (lesbewerker)", () => {
  it("schoont de JSON van de bewerker op: onbekende types weg, ids uniek, getallen binnen bereik", () => {
    const raw = {
      id: "anders",
      title: "  Titel  ",
      requiredForLesson: true,
      feedbackAllowed: "ja",
      repeatOf: "opdr",
      extra: "weg",
      parts: [
        {
          id: "p1",
          title: "Deel",
          fields: [
            { id: "f1", type: "short", label: "Vraag", required: true },
            { id: "f1", type: "long", label: "Dubbel id" },
            { id: "f3", type: "onbekend", label: "x" },
            { id: "f4", type: "single", label: "Keuze", options: ["a", "", "a", "b"] },
            { id: "f5", type: "scale", min: 3, max: 2 },
            { id: "f6", type: "upload", accept: ["pdf", "exe"], maxFiles: 99 },
            { id: "f7", type: "scale_rows", rows: [{ id: "r", label: "Een" }, { label: "" }, { id: "r", label: "Twee" }], mode: "text" },
          ],
        },
      ],
    };
    const a = cleanAssignment(raw, "opdr", makeId);
    expect(a.id).toBe("opdr");
    expect(a.title).toBe("Titel");
    expect(a.feedbackAllowed).toBe(false);
    expect(a.repeatOf).toBeNull(); // never a repeat of itself
    expect(a).not.toHaveProperty("extra");
    const fields = a.parts[0].fields;
    expect(fields.map((f) => f.type)).toEqual(["short", "long", "single", "scale", "upload", "scale_rows"]);
    expect(new Set(fields.map((f) => f.id)).size).toBe(fields.length);
    expect(fields[0].required).toBe(true);
    expect(fields[1].required).toBe(false);
    expect(fields[2]).toMatchObject({ options: ["a", "b"] });
    expect(fields[3]).toMatchObject({ min: 3, max: 4 });
    expect(fields[4]).toMatchObject({ accept: ["pdf"], maxFiles: 20 });
    expect(fields[5]).toMatchObject({ mode: "text" });
    const rows = (fields[5] as { rows: { id: string; label: string }[] }).rows;
    expect(rows.map((r) => r.label)).toEqual(["Een", "Twee"]);
    expect(rows[0].id).not.toBe(rows[1].id);
  });

  it("nieuwe opdracht en nieuwe velden hebben zinnige standaarden", () => {
    const a = newAssignment("x", makeId);
    expect(a.parts[0].fields[0]).toMatchObject({ type: "long", required: true });
    expect(newField("upload", "u")).toMatchObject({ required: false, maxFiles: 1 });
    expect(newField("scale", "s")).toMatchObject({ min: 1, max: 5 });
    expect(cleanAssignment(a, "x", makeId)).toEqual(a);
  });
});

describe("antwoorden van de cursist", () => {
  it("bewaart alleen wat bij het veld past; bestanden komen nooit uit de browser", () => {
    const previous = { upl: { files: [file("a"), file("b")] }, weg: { text: "oud veld" } };
    const out = cleanAnswers(
      assignment,
      {
        kort: { text: "Lotte" },
        een: { choice: "Onbekend", comment: "omdat" },
        meer: { choices: ["Goud", "Zilver"] },
        schaal: { score: 9 },
        rijen: { rows: { r1: 4, r2: 7, r9: 1 } },
        upl: { keep: ["b", "verzonnen"], files: [file("hack")] },
        nep: { text: "x" },
      },
      previous,
    );
    expect(out.kort).toEqual({ text: "Lotte" });
    expect(out.een).toEqual({ choice: null, comment: "omdat" });
    expect(out.meer).toEqual({ choices: ["Goud"] });
    expect(out.schaal).toEqual({ score: null });
    expect(out.rijen).toEqual({ rows: { r1: 4 } });
    expect(out.upl).toEqual({ files: [file("b")] });
    expect(out).not.toHaveProperty("nep");
    // An answer to a field the owner removed later is kept.
    expect(out.weg).toEqual({ text: "oud veld" });
  });

  it("een veld dat niet meekomt, houdt zijn vorige antwoord", () => {
    const out = cleanAnswers(assignment, {}, { kort: { text: "blijft" }, een: { choice: "Boho" }, upl: { files: [file("a")] } });
    expect(out.kort).toEqual({ text: "blijft" });
    expect(out.een).toEqual({ choice: "Boho" });
    expect(out.upl).toEqual({ files: [file("a")] });
  });

  it("verplichte velden: indienen wacht erop, lege tekst telt niet", () => {
    expect(missingRequiredFields(assignment, {}).map((f) => f.id)).toEqual(["kort", "een", "schaal", "rijen", "upl"]);
    const answers = {
      kort: { text: "  " },
      een: { choice: "Boho" },
      schaal: { score: 3 },
      rijen: { rows: { r1: 2 } },
      upl: { files: [file("a")] },
    };
    expect(missingRequiredFields(assignment, answers).map((f) => f.id)).toEqual(["kort", "rijen"]);
    expect(missingRequiredFields(assignment, { ...answers, kort: { text: "ok" }, rijen: { rows: { r1: 2, r2: 5 } } })).toEqual([]);
    const textRows = { ...assignment.parts[1].fields[1], mode: "text" } as never;
    expect(isFieldAnswered(textRows, { rows: { r1: "ja", r2: " " } })).toBe(false);
    expect(isFieldAnswered(textRows, { rows: { r1: "ja", r2: "nee" } })).toBe(true);
  });

  it("ziet of het concept afwijkt van de laatst ingediende versie", () => {
    expect(sameAnswers({ a: { text: "x", choices: ["1"] } }, { a: { choices: ["1"], text: "x" } })).toBe(true);
    expect(sameAnswers({ a: { text: "x" } }, { a: { text: "y" } })).toBe(false);
  });

  it("antwoorden als tekst (MCP, export)", () => {
    const lines = answersAsText(assignment, { kort: { text: "Lotte" }, rijen: { rows: { r1: 4 } }, upl: { files: [file("a")] } });
    expect(lines.find((l) => l.question === "Naam")?.answer).toBe("Lotte");
    expect(lines.find((l) => l.question === "Scan")?.answer).toBe("Plannen: 4\nCommuniceren: -");
    expect(lines.find((l) => l.question === "Moodboard")?.answer).toBe("a.pdf");
  });
});

describe("uploads", () => {
  const field = { accept: ["pdf", "docx", "mp4"] as const, maxFiles: 2 };
  it("controleert type, grootte en aantal", () => {
    expect(uploadKindOf("Plan.DOCX")).toBe("docx");
    expect(uploadKindOf("oud.doc")).toBe("docx");
    expect(uploadKindOf("geluid.m4a")).toBe("audio");
    expect(uploadKindOf("virus.exe")).toBeNull();
    const f = { accept: [...field.accept], maxFiles: 2 };
    expect(uploadProblem(f, { name: "a.pdf", size: 1000 }, 0)).toBeNull();
    expect(uploadProblem(f, { name: "a.png", size: 1000 }, 0)).toMatch(/niet toegestaan/);
    expect(uploadProblem(f, { name: "a.pdf", size: 11 * 1024 * 1024 }, 0)).toMatch(/groter dan 10 MB/);
    expect(uploadProblem(f, { name: "film.mp4", size: 40 * 1024 * 1024 }, 0)).toBeNull();
    expect(uploadProblem(f, { name: "a.pdf", size: 1000 }, 2)).toMatch(/maximaal 2/);
    expect(uploadProblem({ ...f, maxFiles: 1 }, { name: "a.pdf", size: 1000 }, 1)).toMatch(/één bestand/);
    expect(uploadProblem(f, { name: "leeg.pdf", size: 0 }, 0)).toMatch(/leeg/);
    expect(acceptFor(["pdf", "jpg"])).toBe(".pdf,.jpg,.jpeg");
  });
});

describe("feedbacklimiet en lesafronding", () => {
  it("maximaal twee feedbackverzoeken per module", () => {
    expect(feedbackRequestAllowed(0)).toBe(true);
    expect(feedbackRequestAllowed(1)).toBe(true);
    expect(feedbackRequestAllowed(2)).toBe(false);
  });

  it("les af als alle opdrachten die verplicht zijn voor afronding zijn ingediend", () => {
    const optional = { ...assignment, id: "opt", requiredForLesson: false };
    const blocks = [assignment, optional];
    expect(lessonCompletion(blocks, [])).toMatchObject({ byAssignments: true, complete: false });
    expect(lessonCompletion(blocks, [{ blockId: "opdr", status: "concept" }]).complete).toBe(false);
    expect(lessonCompletion(blocks, [{ blockId: "opdr", status: "ingediend" }]).complete).toBe(true);
    // Verbetering nodig of nog geen feedback: de les blijft afgerond, niets blokkeert.
    expect(lessonCompletion(blocks, [{ blockId: "opdr", status: "verbetering_nodig" }]).complete).toBe(true);
    expect(lessonCompletion([optional], [])).toMatchObject({ byAssignments: false, complete: false });
  });
});

describe("competentiescan: begin- en eindmeting", () => {
  const seed = createSeed();
  const blocks = seed.lessons.flatMap((l) => l.blocks).filter((b): b is AssignmentBlock => b.type === "assignment");
  const begin = blocks.find((b) => b.id === "b-1-3-2")!;
  const end = blocks.find((b) => b.repeatOf === "b-1-3-2")!;

  it("de seed van module 1 heeft de tien competenties en een score-uitleg", () => {
    const field = begin.parts[0].fields[0];
    expect(field.type).toBe("scale_rows");
    expect(field.type === "scale_rows" && field.rows.map((r) => r.label)).toEqual(COMPETENCES);
    expect(COMPETENCES).toHaveLength(10);
    expect(field.type === "scale_rows" && field.explanation).toMatch(/1 = .*\n.*5 = /s);
    expect(seed.lessons.find((l) => l.blocks.includes(begin))?.moduleId).toBe("mod-1");
  });

  it("zet de scores naast elkaar, ook als de herhaling andere ids heeft", () => {
    const first = { assignment: begin, answers: { "scan-competenties": { rows: { "comp-1": 2, "comp-2": 4 } } } };
    const same = compareScans(first, { assignment: end, answers: { "scan-competenties": { rows: { "comp-1": 4, "comp-2": 3 } } } });
    expect(same[0].rows.slice(0, 3)).toEqual([
      { label: "Plannen en organiseren", before: 2, after: 4, change: 2 },
      { label: "Communiceren", before: 4, after: 3, change: -1 },
      { label: "Stressbestendigheid", before: null, after: null, change: null },
    ]);

    // A copy with new field and row ids still lines up by position and label.
    const copy: AssignmentBlock = {
      ...end,
      parts: [{ ...end.parts[0], fields: [{ ...(end.parts[0].fields[0] as Extract<AssignmentField, { type: "scale_rows" }>), id: "nieuw", rows: [{ id: "x", label: "communiceren" }] }] }],
    };
    const byLabel = compareScans(first, { assignment: copy, answers: { nieuw: { rows: { x: 5 } } } });
    expect(byLabel[0].rows).toEqual([{ label: "communiceren", before: 4, after: 5, change: 1 }]);
    expect(compareScans(null, { assignment: end, answers: {} })[0].rows[0].before).toBeNull();
  });
});

describe("oude blokken (voor migratie 0025)", () => {
  const legacy: LegacyBlock[] = [
    { id: "q", type: "question", kind: "reflection", prompt: "Waarom?", helpText: "Vrij", required: true, feedback: false },
    { id: "c", type: "choice", prompt: "Kies", helpText: "", options: ["a", "b"], required: false, feedback: true },
    { id: "u", type: "upload", prompt: "Upload", helpText: "", required: false, feedback: true },
  ];

  it("worden een opdracht met één veld en hetzelfde id", () => {
    const [q, c, u] = legacy.map(legacyToAssignment);
    expect(q).toMatchObject({ id: "q", requiredForLesson: true, feedbackAllowed: false });
    expect(q.parts[0].fields[0]).toEqual({ id: "q-f1", type: "long", label: "Waarom?", help: "Vrij", required: true });
    expect(c.parts[0].fields[0]).toMatchObject({ id: "c-f1", type: "single", options: ["a", "b"], required: false });
    expect(c.feedbackAllowed).toBe(true);
    expect(u.parts[0].fields[0]).toMatchObject({ type: "upload", maxFiles: 10 });
    // The result passes the editor's clean-up unchanged.
    for (const a of [q, c, u]) expect(cleanAssignment(a, a.id, makeId)).toEqual(a);
  });

  it("normaliseBlocks laat andere blokken staan", () => {
    const video = { id: "v", type: "video" as const, url: "", caption: "" };
    const out = normaliseBlocks([video, legacy[0]]);
    expect(out[0]).toBe(video);
    expect(out[1].type).toBe("assignment");
  });
});
