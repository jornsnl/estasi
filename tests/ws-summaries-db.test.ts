import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Summaries through MCP against a real, migrated database: Sabine's Claude
 * finds the assignment, reads the answers and stores the summary in the portal.
 * Runs only with TEST_DATABASE_URL.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("samenvattingen via MCP", () => {
  let db: typeof import("@/lib/ws/db");
  let handleBody: typeof import("@/lib/mcp/protocol").handleBody;
  let coupleId = "";
  let stylingId = "";
  let questionsId = "";
  const ctx = (scope: ("read" | "write")[]) => ({
    user: { id: "owner-test", name: "Sabine", email: "s@x.nl", role: "owner" } as never,
    scope,
    clientName: "Claude",
  });
  const call = async (name: string, args: Record<string, unknown>, scope: ("read" | "write")[] = ["read", "write"]) => {
    const res = (await handleBody({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, ctx(scope))) as {
      result: { content: { text: string }[]; isError: boolean };
    };
    const text = res.result.content[0].text;
    return { isError: res.result.isError, text, data: res.result.isError ? null : JSON.parse(text) };
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import("@/lib/ws/db");
    ({ handleBody } = await import("@/lib/mcp/protocol"));
    coupleId = (await db.one<{ id: string }>("insert into couples (partner1_first, partner2_first) values ('Anna', 'Bram') returning id"))!.id;
    stylingId = (await db.one<{ id: string }>(
      "insert into assignments (couple_id, title, styling_source, submitted_at) values ($1, 'Thema & Moodboard', true, now()) returning id",
      [coupleId],
    ))!.id;
    await db.query("insert into assignment_questions (assignment_id, prompt, answer, position) values ($1, 'Welke sfeer?', 'Boho, veel droogbloemen, terracotta', 1)", [stylingId]);
    questionsId = (await db.one<{ id: string }>("insert into assignments (couple_id, title, submitted_at) values ($1, 'Jullie verhaal', now()) returning id", [coupleId]))!.id;
    await db.query("insert into assignment_questions (assignment_id, prompt, answer, position) values ($1, 'Hoe hebben jullie elkaar ontmoet?', 'Op de fiets in Utrecht', 1)", [questionsId]);
    await db.query("insert into styling_places (couple_id, name, position) values ($1, 'Ceremonie', 1), ($1, 'Diner', 2)", [coupleId]);
  });

  afterAll(async () => {
    if (coupleId) await db.query("delete from couples where id = $1", [coupleId]);
  });

  it("lists what still needs a summary and points to the right tools", async () => {
    const { data } = await call("ws_list_assignments_to_summarise", { coupleId });
    expect(data.map((a: { title: string }) => a.title).sort()).toEqual(["Jullie verhaal", "Thema & Moodboard"]);
    expect(data.find((a: { stylingSource: boolean }) => a.stylingSource).next).toContain("ws_save_styling_summary");
  });

  it("reads the styling answers with the places", async () => {
    const { data } = await call("ws_get_styling_input", { coupleId }, ["read"]);
    expect(data.places).toEqual(["Ceremonie", "Diner"]);
    expect(data.assignments[0].answers[0].answer).toContain("terracotta");
  });

  it("stores the styling summary as a draft, with items per known place", async () => {
    const { data } = await call("ws_save_styling_summary", {
      coupleId,
      summary: "Jullie dromen van een boho bruiloft.",
      colors: ["#C2703D", "#F3E9DC"],
      items: [{ place: "ceremonie", what: "Boog met droogbloemen" }, { place: "Tuin", what: "Lampionnen" }],
    });
    expect(data.skippedPlaces).toEqual(["Tuin"]);
    const plan = await db.one<{ ai_draft: string; colors: string[]; published: boolean }>("select ai_draft, colors, published from styling_plans where couple_id = $1", [coupleId]);
    expect(plan).toMatchObject({ ai_draft: "Jullie dromen van een boho bruiloft.", colors: ["#c2703d", "#f3e9dc"], published: false });
    const items = await db.query<{ what: string; draft: boolean }>("select what, draft from styling_items where couple_id = $1", [coupleId]);
    expect(items).toEqual([{ what: "Boog met droogbloemen", draft: true }]);
    const activity = await db.one<{ action: string }>("select action from activity where couple_id = $1 order by id desc limit 1", [coupleId]);
    expect(activity?.action).toBe("Stylingsamenvatting gemaakt met Claude");
  });

  it("stores the summary of an assignment and needs write access for it", async () => {
    const readOnly = await call("ws_save_assignment_summary", { assignmentId: questionsId, summary: "• Ontmoet op de fiets" }, ["read"]);
    expect(readOnly.isError).toBe(true);
    await call("ws_save_assignment_summary", { assignmentId: questionsId, summary: "• Ontmoet op de fiets" });
    const a = await db.one<{ ai_summary: string }>("select ai_summary from assignments where id = $1", [questionsId]);
    expect(a?.ai_summary).toBe("• Ontmoet op de fiets");
    const { data } = await call("ws_list_assignments_to_summarise", { coupleId });
    expect(data).toEqual([]);
  });
});
