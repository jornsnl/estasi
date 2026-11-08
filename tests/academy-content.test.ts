import { describe, expect, it } from "vitest";
import type { Enrollment, Lesson, Module } from "@/lib/data/types";
import { isEmptyHtml, sanitizeLessonHtml } from "@/lib/domain/html";
import { moduleProgress, overallPercent } from "@/lib/domain/progress";
import {
  applyEdit,
  copyLesson,
  discardDraft,
  editableContent,
  hasPendingChanges,
  orderBlocks,
  publishLesson,
  unpublishLesson,
} from "@/lib/domain/publishing";
import { lessonFileIds, lessonVisibleFor, moduleVisibleFor, parseModulePackages, visibleCourse } from "@/lib/domain/visibility";

const enrollment = (pkg: "A" | "B") => ({ package: pkg }) as Pick<Enrollment, "package">;
const mod = (id: string, position: number, extra: Partial<Module> = {}): Module => ({ id, title: id, description: "", position, ...extra });
const lesson = (id: string, moduleId: string, extra: Partial<Lesson> = {}): Lesson => ({
  id, moduleId, title: id, summary: "", position: 1, blocks: [], ...extra,
});

describe("pakketzichtbaarheid", () => {
  it("toont een module alleen aan het juiste pakket", () => {
    const both = mod("m1", 1, { packages: "AB" });
    const onlyB = mod("m2", 2, { packages: "B" });
    const onlyA = mod("m3", 3, { packages: "A" });
    expect(moduleVisibleFor(both, enrollment("A"))).toBe(true);
    expect(moduleVisibleFor(both, enrollment("B"))).toBe(true);
    expect(moduleVisibleFor(onlyB, enrollment("A"))).toBe(false);
    expect(moduleVisibleFor(onlyB, enrollment("B"))).toBe(true);
    expect(moduleVisibleFor(onlyA, enrollment("B"))).toBe(false);
    expect(moduleVisibleFor(both, null)).toBe(false);
  });

  it("oude data zonder status of pakket telt als gepubliceerd voor beide pakketten", () => {
    expect(moduleVisibleFor(mod("m", 1), enrollment("A"))).toBe(true);
    expect(parseModulePackages("x")).toBe("AB");
    expect(parseModulePackages("B")).toBe("B");
  });

  it("verbergt concept-modules en concept-lessen", () => {
    const draftModule = mod("m1", 1, { status: "draft" });
    const live = mod("m2", 2);
    expect(moduleVisibleFor(draftModule, enrollment("B"))).toBe(false);
    expect(lessonVisibleFor(lesson("l1", "m1"), draftModule, enrollment("B"))).toBe(false);
    expect(lessonVisibleFor(lesson("l2", "m2", { status: "draft" }), live, enrollment("B"))).toBe(false);
    expect(lessonVisibleFor(lesson("l3", "m2"), live, enrollment("B"))).toBe(true);
    // A lesson never counts as part of a module it does not belong to.
    expect(lessonVisibleFor(lesson("l4", "m1"), live, enrollment("B"))).toBe(false);
  });

  it("niet-toegankelijke modules tellen niet mee voor de voortgang; een upgrade houdt de voortgang", () => {
    const modules = [mod("m1", 1), mod("m2", 2, { packages: "B" })];
    const lessons = [lesson("l1", "m1"), lesson("l2", "m2"), lesson("l3", "m1", { status: "draft" })];
    const completions = [{ userId: "u", lessonId: "l1", completedAt: "2026-01-01T00:00:00.000Z" }];

    const a = visibleCourse(modules, lessons, enrollment("A"));
    expect(a.modules.map((m) => m.id)).toEqual(["m1"]);
    expect(a.lessons.map((l) => l.id)).toEqual(["l1"]);
    expect(overallPercent(moduleProgress(a.modules, a.lessons, completions))).toBe(100);

    // After the upgrade to B the extra module appears and opens; the completion stays.
    const b = visibleCourse(modules, lessons, enrollment("B"));
    const progress = moduleProgress(b.modules, b.lessons, completions);
    expect(progress.map((p) => p.state)).toEqual(["completed", "open"]);
    expect(overallPercent(progress)).toBe(50);
  });

  it("een gepubliceerde module met alleen concept-lessen is (nog) niet zichtbaar en blokkeert niets", () => {
    const modules = [mod("m1", 1), mod("m2", 2), mod("m3", 3)];
    const lessons = [lesson("l1", "m1"), lesson("l2", "m2", { status: "draft" }), lesson("l3", "m3")];
    const course = visibleCourse(modules, lessons, enrollment("A"));
    expect(course.modules.map((m) => m.id)).toEqual(["m1", "m3"]);
    const completions = [{ userId: "u", lessonId: "l1", completedAt: "2026-01-01T00:00:00.000Z" }];
    expect(moduleProgress(course.modules, course.lessons, completions).map((p) => p.state)).toEqual(["completed", "open"]);
  });

  it("vindt de bestanden die de live inhoud van een les gebruikt, niet die van het concept", () => {
    const fileId = "11111111-2222-4333-8444-555555555555";
    const imageId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const draftOnly = "99999999-2222-4333-8444-555555555555";
    const l = lesson("l", "m", {
      blocks: [
        { id: "b1", type: "download", label: "", description: "", url: "", file: { id: fileId, name: "a.pdf", size: 1, mime: "application/pdf" } },
        { id: "b2", type: "text", markdown: "", html: `<p><img src="/api/bestanden/${imageId}"></p>` },
      ],
      draft: { title: "", summary: "", blocks: [{ id: "b3", type: "image", alt: "", caption: "", file: { id: draftOnly, name: "x.png", size: 1, mime: "image/png" } }] },
    });
    const ids = lessonFileIds(l);
    expect(ids.has(fileId)).toBe(true);
    expect(ids.has(imageId)).toBe(true);
    expect(ids.has(draftOnly)).toBe(false);
  });
});

describe("concept en publiceren", () => {
  const text = (id: string, markdown: string) => ({ id, type: "text" as const, markdown });

  it("bewerkt een concept-les direct", () => {
    const l = lesson("l", "m", { status: "draft", blocks: [text("b1", "oud")] });
    const edited = applyEdit(l, { title: "Nieuw", summary: "s", blocks: [text("b1", "nieuw")] });
    expect(edited.title).toBe("Nieuw");
    expect(edited.blocks).toEqual([text("b1", "nieuw")]);
    expect(edited.draft).toBeNull();
  });

  it("zet wijzigingen in een gepubliceerde les apart tot publiceren", () => {
    const l = lesson("l", "m", { status: "published", title: "Live", blocks: [text("b1", "live")] });
    const edited = applyEdit(l, { title: "Nieuw", summary: "", blocks: [text("b1", "concept")] });
    // Students still see the live version.
    expect(edited.title).toBe("Live");
    expect(edited.blocks).toEqual([text("b1", "live")]);
    expect(hasPendingChanges(edited)).toBe(true);
    expect(editableContent(edited).blocks).toEqual([text("b1", "concept")]);

    const published = publishLesson(edited, new Date("2026-02-01T10:00:00Z"));
    expect(published.title).toBe("Nieuw");
    expect(published.blocks).toEqual([text("b1", "concept")]);
    expect(published.draft).toBeNull();
    expect(published.publishedAt).toBe("2026-02-01T10:00:00.000Z");

    const discarded = discardDraft(edited);
    expect(discarded.blocks).toEqual([text("b1", "live")]);
    expect(hasPendingChanges(discarded)).toBe(false);
  });

  it("terug naar precies de live inhoud laat geen concept achter", () => {
    const l = lesson("l", "m", { title: "Live", blocks: [text("b1", "live")] });
    expect(applyEdit(l, { title: "Live", summary: "", blocks: [text("b1", "live")] }).draft).toBeNull();
  });

  it("terugzetten naar concept houdt openstaande wijzigingen", () => {
    const l = applyEdit(lesson("l", "m", { blocks: [text("b1", "live")] }), { title: "l", summary: "", blocks: [text("b1", "nieuw")] });
    const draft = unpublishLesson(l);
    expect(draft.status).toBe("draft");
    expect(draft.blocks).toEqual([text("b1", "nieuw")]);
    expect(draft.draft).toBeNull();
  });

  it("kopieert de definitie met nieuwe blok-ids, als concept", () => {
    let n = 0;
    const l = lesson("l", "m", { title: "Les", status: "published", blocks: [text("b1", "a"), text("b2", "b")] });
    const copy = copyLesson(l, { id: "new", moduleId: "m2", position: 4 }, () => `id${++n}`);
    expect(copy).toMatchObject({ id: "new", moduleId: "m2", position: 4, title: "Les (kopie)", status: "draft", draft: null });
    expect(copy.blocks.map((b) => b.id)).toEqual(["id1", "id2"]);
    expect(copy.blocks.map((b) => (b.type === "text" ? b.markdown : ""))).toEqual(["a", "b"]);
    // The original is untouched.
    expect(l.blocks.map((b) => b.id)).toEqual(["b1", "b2"]);
  });

  it("zet blokken in de volgorde van de editor", () => {
    const blocks = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(orderBlocks(blocks, ["c", "a", "b"]).map((b) => b.id)).toEqual(["c", "a", "b"]);
    expect(orderBlocks(blocks, ["b"]).map((b) => b.id)).toEqual(["b", "a", "c"]);
    expect(orderBlocks(blocks, []).map((b) => b.id)).toEqual(["a", "b", "c"]);
  });
});

describe("leseditor-HTML opschonen", () => {
  it("haalt script-tags en event-attributen weg", () => {
    const out = sanitizeLessonHtml('<p onclick="alert(1)">Hoi<script>alert(2)</script></p><img src="x" onerror="alert(3)">');
    expect(out).toBe("<p>Hoi</p>");
    expect(out).not.toMatch(/script|onclick|onerror|alert/);
  });

  it("houdt de toegestane opmaak", () => {
    const html =
      "<h2>Kop</h2><h3>Tussenkop</h3><p><strong>vet</strong> en <em>cursief</em></p><ul><li>een</li></ul><ol><li>twee</li></ol>" +
      "<table><tbody><tr><th>A</th><td colspan=\"2\">B</td></tr></tbody></table>";
    expect(sanitizeLessonHtml(html)).toBe(html);
  });

  it("maakt links veilig en laat alleen eigen afbeeldingen toe", () => {
    expect(sanitizeLessonHtml('<a href="https://estasi.nl" onmouseover="x()">x</a>')).toBe(
      '<a href="https://estasi.nl" target="_blank" rel="noopener noreferrer">x</a>',
    );
    expect(sanitizeLessonHtml('<a href="javascript:alert(1)">x</a>')).not.toMatch(/javascript/);
    const own = '<img src="/api/bestanden/11111111-2222-4333-8444-555555555555" alt="Bloemen" />';
    expect(sanitizeLessonHtml(own)).toBe('<img src="/api/bestanden/11111111-2222-4333-8444-555555555555" alt="Bloemen" />');
    expect(sanitizeLessonHtml('<img src="https://elders.nl/a.png">')).toBe("");
    expect(sanitizeLessonHtml('<p style="color:red" class="x">t</p><iframe src="https://x"></iframe>')).toBe("<p>t</p>");
    expect(sanitizeLessonHtml("<h1>Titel</h1>")).toBe("<h2>Titel</h2>");
  });

  it("herkent een lege editor", () => {
    expect(isEmptyHtml("<p></p>")).toBe(true);
    expect(isEmptyHtml("<p> &nbsp;</p>")).toBe(true);
    expect(isEmptyHtml("<p>x</p>")).toBe(false);
  });
});
