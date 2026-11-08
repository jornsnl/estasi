import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import type { AssignmentBlock, AssignmentFeedback, Lesson, Module, Submission, SubmissionVersion } from "@/lib/data/types";
import { inzageHtml, INZAGE_SECTIONS, stripSecrets } from "@/lib/domain/inzage";
import { buildPortfolio, escapeHtml, portfolioFeedback, portfolioFiles, portfolioHtml, portfolioItemCount } from "@/lib/domain/portfolio";
import { canViewPortfolio, deletionConfirmed, fileAccess, safeFileName, uniqueNames } from "@/lib/domain/privacy";
import { crc32, createZip } from "@/lib/zip";

const assignment = (id: string, label: string, extra: Partial<AssignmentBlock> = {}): AssignmentBlock => ({
  id,
  type: "assignment",
  title: "",
  intro: "",
  requiredForLesson: true,
  feedbackAllowed: true,
  graded: false,
  repeatOf: null,
  parts: [
    {
      id: `${id}-p`,
      title: "",
      intro: "",
      fields: [
        { id: `${id}-f`, type: "long", label, help: "", required: true },
        { id: `${id}-u`, type: "upload", label: "Upload", help: "", required: false, accept: ["pdf", "jpg"], maxFiles: 3 },
      ],
    },
  ],
  ...extra,
});

const modules: Module[] = [
  { id: "m2", title: "Module twee", description: "", position: 2 },
  { id: "m1", title: "Module een", description: "", position: 1 },
];
const a1 = assignment("a1", "Vraag zoals hij nu is");
const a2 = assignment("a2", "Tweede opdracht");
const lessons: Lesson[] = [
  { id: "l2", moduleId: "m2", title: "Les B", summary: "", position: 1, blocks: [a2] },
  { id: "l1", moduleId: "m1", title: "Les A", summary: "", position: 1, blocks: [{ id: "t", type: "text", markdown: "" }, a1] },
];
const sub = (id: string, lessonId: string, blockId: string, extra: Partial<Submission> = {}): Submission => ({
  id,
  userId: "s",
  lessonId,
  blockId,
  status: "ingediend",
  draft: {},
  draftVersion: 1,
  feedbackRequested: false,
  questionForSabine: "",
  submittedAt: "2026-05-01T10:00:00Z",
  createdAt: "2026-05-01T09:00:00Z",
  updatedAt: "2026-05-01T10:00:00Z",
  ...extra,
});
const pdf = { id: "f1", name: "plan.pdf", size: 3, mime: "application/pdf" };
const photo = { id: "f2", name: "plan.pdf", size: 3, mime: "image/jpeg" };
const oldQuestion = assignment("a1", "Vraag zoals hij toen was");
const versions: SubmissionVersion[] = [
  { id: "v2", submissionId: "s1", userId: "s", version: 2, answers: { "a1-f": { text: "Beter" }, "a1-u": { files: [pdf, photo] } }, assignment: a1, feedbackRequested: false, questionForSabine: "", feedbackStatus: null, submittedAt: "2026-05-03T10:00:00Z" },
  { id: "v1", submissionId: "s1", userId: "s", version: 1, answers: { "a1-f": { text: "Eerste <b>poging</b>" } }, assignment: oldQuestion, feedbackRequested: true, questionForSabine: "Klopt dit?", feedbackStatus: "afgerond", submittedAt: "2026-05-01T10:00:00Z" },
  { id: "v9", submissionId: "s9", userId: "s", version: 1, answers: { "x-f": { text: "Weg" } }, assignment: assignment("x", "Les bestaat niet meer"), feedbackRequested: false, questionForSabine: "", feedbackStatus: null, submittedAt: "2026-04-01T10:00:00Z" },
];
const feedback: AssignmentFeedback[] = [
  { id: "fb1", versionId: "v1", submissionId: "s1", userId: "s", authorId: "o", text: "Goed!", attachment: { id: "f3", name: "tips.pdf", size: 1, mime: "application/pdf" }, sentAt: "2026-05-02T10:00:00Z", createdAt: "2026-05-02T09:00:00Z", updatedAt: "2026-05-02T10:00:00Z", assessment: null, seenAt: null },
  { id: "fb2", versionId: "v2", submissionId: "s1", userId: "s", authorId: "o", text: "Concept", attachment: null, sentAt: null, createdAt: "2026-05-04T09:00:00Z", updatedAt: "2026-05-04T09:00:00Z", assessment: null, seenAt: null },
];
const submissions = [
  sub("s1", "l1", "a1"),
  sub("s2", "l2", "a2", { status: "concept", submittedAt: null, draft: { "a2-f": { text: "Half af" } } }),
  sub("s3", "l2", "a2-leeg", { status: "concept", submittedAt: null }),
  sub("s9", "weg", "x"),
];

describe("portfolio (Academy 10)", () => {
  const portfolio = buildPortfolio({ modules, lessons, submissions, versions, feedback: portfolioFeedback(feedback, "student") });

  it("per module en les, op volgorde, met concepten en lessen die niet meer bestaan", () => {
    expect(portfolio.map((m) => m.title)).toEqual(["Module een", "Module twee", "Lessen die niet meer bestaan"]);
    expect(portfolio[0].lessons[0].title).toBe("Les A");
    expect(portfolioItemCount(portfolio)).toBe(3); // the empty concept s3 is left out
    const draft = portfolio[1].lessons[0].items[0];
    expect(draft.versions).toHaveLength(0);
    expect(draft.draft?.answers["a2-f"].text).toBe("Half af");
    expect(portfolio[2].lessons[0].items[0].title).toBe("Les bestaat niet meer");
  });

  it("alle versies, oudste eerst, met de vragen zoals ze toen waren", () => {
    const item = portfolio[0].lessons[0].items[0];
    expect(item.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(item.versions[0].assignment.parts[0].fields[0].label).toBe("Vraag zoals hij toen was");
    expect(item.draft).toBeNull();
  });

  it("een cursist ziet alleen verstuurde feedback, Sabine ook concepten", () => {
    const item = portfolio[0].lessons[0].items[0];
    expect(item.versions[0].feedback.map((f) => f.id)).toEqual(["fb1"]);
    expect(item.versions[1].feedback).toHaveLength(0);
    const owner = buildPortfolio({ modules, lessons, submissions, versions, feedback: portfolioFeedback(feedback, "owner") });
    expect(owner[0].lessons[0].items[0].versions[1].feedback.map((f) => f.id)).toEqual(["fb2"]);
  });

  it("na indienen aangepast: het concept staat erbij", () => {
    const changed = buildPortfolio({
      modules,
      lessons,
      submissions: [sub("s1", "l1", "a1", { draft: { "a1-f": { text: "Nog beter" } } })],
      versions,
      feedback: [],
    });
    expect(changed[0].lessons[0].items[0].draft?.answers["a1-f"].text).toBe("Nog beter");
  });

  it("elk bestand één keer, met unieke namen in de map bestanden", () => {
    const files = portfolioFiles(portfolio);
    expect(files.map((f) => f.path).sort()).toEqual(["bestanden/plan (2).pdf", "bestanden/plan.pdf", "bestanden/tips.pdf"]);
  });

  it("de html-export ontsnapt alle tekst en toont afbeeldingen", () => {
    const html = portfolioHtml(portfolio, { studentName: "Lotte <script>", generatedAt: "2026-11-08T10:00:00Z", formatDate: (d) => d, hrefFor: (f) => `bestanden/${f.name}` });
    expect(html).not.toContain("<script>");
    expect(html).toContain("Lotte &lt;script&gt;");
    expect(html).toContain("Eerste &lt;b&gt;poging&lt;/b&gt;");
    expect(html).toContain('<img class="preview" src="bestanden/plan.pdf"');
    expect(html).toContain("Feedback van Sabine");
    expect(html).toContain("Klopt dit?");
    expect(escapeHtml(`"'&`)).toBe("&quot;&#39;&amp;");
  });
});

describe("wie mag wat (Academy 16)", () => {
  const owner = { id: "o", role: "owner" as const };
  const student = { id: "s", role: "student" as const };
  const couple = { id: "c", role: "couple" as const };

  it("portfolio: alleen de eigen, of Sabine", () => {
    expect(canViewPortfolio(student, "s")).toBe(true);
    expect(canViewPortfolio(student, "ander")).toBe(false);
    expect(canViewPortfolio(owner, "ander")).toBe(true);
    expect(canViewPortfolio(couple, "c")).toBe(false);
  });

  it("bestanden: eigen bestanden, lesmateriaal via de les, nooit van een ander", () => {
    expect(fileAccess(student, "s")).toBe("allow");
    expect(fileAccess(student, "ander")).toBe("deny");
    expect(fileAccess(student, null)).toBe("course");
    expect(fileAccess(owner, "ander")).toBe("allow");
    expect(fileAccess(couple, null)).toBe("deny");
    expect(fileAccess(couple, "c")).toBe("deny");
  });

  it("definitief verwijderen vraagt vinkje én het e-mailadres", () => {
    const user = { email: "lotte@voorbeeld.nl" };
    expect(deletionConfirmed(user, " Lotte@Voorbeeld.nl ", true)).toBe(true);
    expect(deletionConfirmed(user, "lotte@voorbeeld.nl", false)).toBe(false);
    expect(deletionConfirmed(user, "noor@voorbeeld.nl", true)).toBe(false);
    expect(deletionConfirmed({ email: "" }, "", true)).toBe(false);
  });

  it("bestandsnamen in een zip: geen mappen of rare tekens, uniek", () => {
    expect(safeFileName("../../etc/passwd")).toBe("etc-passwd");
    expect(safeFileName("a:b*c?.pdf")).toBe("a-b-c-.pdf");
    expect(safeFileName("   ")).toBe("bestand");
    expect(uniqueNames(["a.pdf", "A.pdf", "a.pdf", "b"])).toEqual(["a.pdf", "A (2).pdf", "a (3).pdf", "b"]);
  });
});

describe("inzage-export (Academy 16)", () => {
  it("geen sleutels, hashes of bestandsbytes", () => {
    expect(stripSecrets({ id: 1, p256dh: "x", auth: "y", access_hash: "z", public_key: "k", data: "b", code_hash: "c", certificate_code: "WPA" })).toEqual({
      id: 1,
      certificate_code: "WPA",
    });
  });

  it("alle onderdelen die de opdracht noemt zitten erin", () => {
    const keys = INZAGE_SECTIONS.map((s) => s.key);
    for (const k of ["account", "profiel", "inschrijving", "opdrachten", "versies", "feedback", "community_berichten", "community_reacties", "privéberichten", "logboek", "bestanden", "mails"]) {
      expect(keys).toContain(k);
    }
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("leesbaar overzicht, ontsnapt", () => {
    const html = inzageHtml([{ key: "account", title: "Account", description: "", rows: [{ name: "<i>Lotte</i>", pauses: [{ a: 1 }] }] }], { name: "Lotte", generatedAt: "x", formatDate: (d) => d });
    expect(html).toContain("&lt;i&gt;Lotte&lt;/i&gt;");
    expect(html).not.toContain("<i>Lotte");
  });
});

describe("zip zonder extra pakket", () => {
  it("crc32 klopt", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("unzip leest de zip, ook met deflate en Nederlandse namen", () => {
    const big = Buffer.from("<p>portfolio</p>".repeat(500), "utf8");
    const zip = createZip([
      { name: "portfolio.html", data: big, compress: true },
      { name: "bestanden/geüpload plan.pdf", data: Buffer.from([1, 2, 3, 255]) },
      { name: "leeg.txt", data: Buffer.alloc(0), compress: true },
    ]);
    expect(zip.length).toBeLessThan(big.length);
    const dir = mkdtempSync(path.join(tmpdir(), "zip-"));
    try {
      const file = path.join(dir, "test.zip");
      writeFileSync(file, zip);
      let unzipAvailable = true;
      try {
        execFileSync("unzip", ["-v"], { stdio: "ignore" });
      } catch {
        unzipAvailable = false;
      }
      if (!unzipAvailable) return;
      execFileSync("unzip", ["-q", "-o", file, "-d", path.join(dir, "uit")]);
      expect(readFileSync(path.join(dir, "uit", "portfolio.html"))).toEqual(big);
      expect([...readFileSync(path.join(dir, "uit", "bestanden", "geüpload plan.pdf"))]).toEqual([1, 2, 3, 255]);
      expect(readFileSync(path.join(dir, "uit", "leeg.txt")).length).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
