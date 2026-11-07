import "server-only";
import { budgetTotals } from "@/lib/ws/budget";
import { costLines } from "@/lib/ws/costs";
import { coupleMembers, couplePackages, listCouples } from "@/lib/ws/couples";
import { isUuid, one, query } from "@/lib/ws/db";
import { coupleName, formatDate, LANE_LABELS, LANES, todayIso } from "@/lib/ws/format";
import { appUrl, sendMail } from "@/lib/ws/mail";
import { rowsFor, sortSchedule, tabsFor } from "@/lib/ws/runsheet";
import { SUPPLIER_STATUS, suppliersFor } from "@/lib/ws/suppliers";
import type { Appointment, Couple, Lane, Meeting, Package, Question, Task } from "@/lib/ws/types";
import { defineTool, ToolError, z } from "../tool";

/** MCP tools for Your Wedding Space (the portal per couple). Needs DATABASE_URL. */

const uuid = z.string().refine(isUuid, "Geen geldig id (uuid).");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als JJJJ-MM-DD");
const lane = z.enum(LANES as [Lane, ...Lane[]]);

async function couple(coupleId: string): Promise<Couple> {
  const found = await one<Couple>("select * from couples where id = $1", [coupleId]);
  if (!found) throw new ToolError("Bruidspaar niet gevonden. Gebruik ws_list_couples voor de ids.");
  return found;
}

const coupleRef = (c: Pick<Couple, "id" | "partner1_first" | "partner2_first">) => ({ id: c.id, name: coupleName(c) });
const euro = (cents: number | null | undefined) => (cents === null || cents === undefined ? null : Math.round(cents) / 100);

export const weddingTools = [
  defineTool({
    name: "ws_list_couples",
    title: "Wedding Space: bruidsparen",
    description: "Alle bruidsparen met trouwdatum, locatie, status (concept, actief, gearchiveerd), pakketten, open vragen, open taken voor Sabine en laatste activiteit. Zoek op naam of locatie.",
    scope: "read",
    input: z.object({
      search: z.string().max(100).optional(),
      includeArchived: z.boolean().default(false),
    }),
    async run({ search, includeArchived }) {
      const needle = search?.trim().toLowerCase();
      return (await listCouples(includeArchived))
        .filter((c) => !needle || `${c.partner1_first} ${c.partner1_last} ${c.partner2_first} ${c.partner2_last} ${c.location}`.toLowerCase().includes(needle))
        .map((c) => ({
          id: c.id,
          name: coupleName(c),
          partners: [`${c.partner1_first} ${c.partner1_last}`.trim(), `${c.partner2_first} ${c.partner2_last}`.trim()].filter(Boolean),
          weddingDate: c.wedding_date,
          weddingDateConfirmed: c.wedding_date_confirmed,
          location: c.location,
          status: c.status,
          packages: c.package_name,
          openQuestions: c.open_questions,
          openTasksForSabine: c.open_sabine_tasks,
          lastActivity: c.last_activity,
          portal: `${appUrl()}/k/${c.id}`,
        }));
    },
  }),

  defineTool({
    name: "ws_get_couple",
    title: "Wedding Space: bruidspaar",
    description: "Alles over één bruidspaar: contactgegevens, trouwdatum en locatie, pakketten, accounts, aantallen gasten, totaalbudget, open taken per kolom, open vragen, komende afspraken en de meetings.",
    scope: "read",
    input: z.object({ coupleId: uuid }),
    async run({ coupleId }) {
      const c = await couple(coupleId);
      const [packages, members, tasks, questions, appointments, meetings] = await Promise.all([
        couplePackages(c.id),
        coupleMembers(c.id),
        query<{ lane: Lane; n: number }>("select lane, count(*)::int as n from tasks where couple_id = $1 and done_at is null group by lane", [c.id]),
        query<Question>("select * from questions where couple_id = $1 and answered_at is null order by asked_at", [c.id]),
        query<Appointment>("select * from appointments where couple_id = $1 and on_date >= $2 order by on_date, at_time limit 10", [c.id, todayIso()]),
        query<Meeting>("select * from meetings where couple_id = $1 order by position", [c.id]),
      ]);
      return {
        id: c.id,
        name: coupleName(c),
        status: c.status,
        partner1: { first: c.partner1_first, last: c.partner1_last, email: c.partner1_email, phone: c.partner1_phone },
        partner2: { first: c.partner2_first, last: c.partner2_last, email: c.partner2_email, phone: c.partner2_phone },
        address: c.address,
        weddingDate: c.wedding_date,
        weddingDateConfirmed: c.wedding_date_confirmed,
        location: c.location,
        guests: { day: c.guests_day, dayKids: c.guests_day_kids, evening: c.guests_evening },
        totalBudgetEuro: euro(c.total_budget_cents),
        packages: packages.map((p) => ({ id: p.id, name: p.name, variant: p.variant, kind: p.kind })),
        accounts: members.map((m) => ({ name: m.name, email: m.email, activated: m.activated, lastActiveAt: m.lastActiveAt })),
        openTasks: Object.fromEntries(LANES.map((l) => [LANE_LABELS[l], tasks.find((t) => t.lane === l)?.n ?? 0])),
        openQuestions: questions.map((q) => ({ id: q.id, askedAt: q.asked_at, by: q.asked_by_name, question: q.body })),
        upcoming: appointments.map((a) => ({ id: a.id, kind: a.kind, title: a.title, date: a.on_date, time: a.at_time, withSabine: a.with_sabine })),
        meetings: meetings.map((m) => ({ id: m.id, title: m.title, kind: m.kind, status: m.status, plannedOn: m.planned_on, hasSummary: Boolean(m.summary) })),
        portal: `${appUrl()}/k/${c.id}`,
      };
    },
  }),

  defineTool({
    name: "ws_list_tasks",
    title: "Wedding Space: taken",
    description: "Taken van het takenbord. Zonder coupleId: Sabine's eigen takenbord over alle bruidsparen (kolom sabine). Met coupleId: alle kolommen van dat bruidspaar (couple, sabine, bride, groom). Open taken, of ook afgevinkte met includeDone.",
    scope: "read",
    input: z.object({ coupleId: uuid.optional(), lane: lane.optional(), includeDone: z.boolean().default(false) }),
    async run({ coupleId, lane: onlyLane, includeDone }) {
      const laneFilter = onlyLane ?? (coupleId ? null : "sabine");
      const rows = await query<Task & { partner1_first: string; partner2_first: string; wedding_date: string | null }>(
        `select t.*, c.partner1_first, c.partner2_first, c.wedding_date
           from tasks t join couples c on c.id = t.couple_id
          where ($1::uuid is null or t.couple_id = $1) and ($2::text is null or t.lane = $2)
            and ($3 or t.done_at is null) and c.status <> 'archived'
          order by t.done_at nulls first, t.deadline nulls last, c.wedding_date nulls last, t.position
          limit 300`,
        [coupleId ?? null, laneFilter, includeDone],
      );
      return rows.map((t) => ({
        id: t.id,
        couple: coupleRef({ id: t.couple_id, partner1_first: t.partner1_first, partner2_first: t.partner2_first }),
        weddingDate: t.wedding_date,
        lane: LANE_LABELS[t.lane],
        laneCode: t.lane,
        title: t.title,
        deadline: t.deadline,
        notes: t.notes,
        doneAt: t.done_at,
        doneBy: t.done_by_name || null,
      }));
    },
  }),

  defineTool({
    name: "ws_list_questions",
    title: "Wedding Space: vragen",
    description: "Vragen die bruidsparen in hun portaal hebben gesteld. Standaard alleen de onbeantwoorde (over alle bruidsparen), oudste eerst. Met answered=true ook de beantwoorde met het antwoord.",
    scope: "read",
    input: z.object({ coupleId: uuid.optional(), answered: z.boolean().default(false), limit: z.number().int().min(1).max(200).default(50) }),
    async run({ coupleId, answered, limit }) {
      const rows = await query<Question & { partner1_first: string; partner2_first: string }>(
        `select q.*, c.partner1_first, c.partner2_first from questions q join couples c on c.id = q.couple_id
          where ($1::uuid is null or q.couple_id = $1) and ($2 or q.answered_at is null) and c.status <> 'archived'
          order by q.answered_at nulls first, q.asked_at limit $3`,
        [coupleId ?? null, answered, limit],
      );
      return rows.map((q) => ({
        id: q.id,
        couple: coupleRef({ id: q.couple_id, partner1_first: q.partner1_first, partner2_first: q.partner2_first }),
        askedAt: q.asked_at,
        askedBy: q.asked_by_name,
        question: q.body,
        answer: q.answer,
        answeredAt: q.answered_at,
      }));
    },
  }),

  defineTool({
    name: "ws_agenda",
    title: "Wedding Space: agenda",
    description: "Afspraken, deadlines en geplande meetings in een periode (standaard vandaag tot over 30 dagen), over alle bruidsparen of voor één bruidspaar. Met onlyWithSabine alleen Sabine's eigen afspraken en de deadlines.",
    scope: "read",
    input: z.object({ from: date.optional(), to: date.optional(), coupleId: uuid.optional(), onlyWithSabine: z.boolean().default(false) }),
    async run({ from, to, coupleId, onlyWithSabine }) {
      const start = from ?? todayIso();
      const end = to ?? todayIso(new Date(Date.now() + 30 * 86_400_000));
      const [appointments, meetings, weddings] = await Promise.all([
        query<Appointment & { partner1_first: string; partner2_first: string }>(
          `select a.*, c.partner1_first, c.partner2_first from appointments a join couples c on c.id = a.couple_id
            where a.on_date between $1 and $2 and ($3::uuid is null or a.couple_id = $3) and c.status <> 'archived'
              and (not $4 or a.with_sabine or a.kind = 'deadline')
            order by a.on_date, a.at_time`,
          [start, end, coupleId ?? null, onlyWithSabine],
        ),
        query<Meeting & { partner1_first: string; partner2_first: string }>(
          `select m.*, c.partner1_first, c.partner2_first from meetings m join couples c on c.id = m.couple_id
            where m.planned_on between $1 and $2 and ($3::uuid is null or m.couple_id = $3) and c.status <> 'archived'
            order by m.planned_on`,
          [start, end, coupleId ?? null],
        ),
        query<Couple>(
          "select * from couples where wedding_date between $1 and $2 and ($3::uuid is null or id = $3) and status <> 'archived' order by wedding_date",
          [start, end, coupleId ?? null],
        ),
      ]);
      const items = [
        ...appointments.map((a) => ({ date: a.on_date, time: a.at_time || null, type: a.kind === "deadline" ? "deadline" : a.with_sabine ? "afspraak met Sabine" : "afspraak", title: a.title, notes: a.notes, couple: coupleRef({ id: a.couple_id, partner1_first: a.partner1_first, partner2_first: a.partner2_first }), id: a.id })),
        ...meetings.map((m) => ({ date: m.planned_on!, time: null, type: `meeting (${m.status})`, title: m.title, notes: "", couple: coupleRef({ id: m.couple_id, partner1_first: m.partner1_first, partner2_first: m.partner2_first }), id: m.id })),
        ...weddings.map((c) => ({ date: c.wedding_date!, time: null, type: "bruiloft", title: `Bruiloft ${coupleName(c)}${c.location ? `, ${c.location}` : ""}`, notes: "", couple: coupleRef(c), id: c.id })),
      ];
      return { from: start, to: end, items: items.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "")) };
    },
  }),

  defineTool({
    name: "ws_list_meetings",
    title: "Wedding Space: meetings",
    description: "De meetings uit het pakket van een bruidspaar (meetings, detailmeeting, evaluatie) met status, datum, gespreksleidraad en samenvatting.",
    scope: "read",
    input: z.object({ coupleId: uuid }),
    async run({ coupleId }) {
      await couple(coupleId);
      const rows = await query<Meeting>("select * from meetings where couple_id = $1 order by position", [coupleId]);
      return rows.map((m) => ({ id: m.id, title: m.title, kind: m.kind, status: m.status, plannedOn: m.planned_on, guide: m.guide, summary: m.summary }));
    },
  }),

  defineTool({
    name: "ws_list_suppliers",
    title: "Wedding Space: leveranciers",
    description: "De leveranciers van een bruidspaar per categorie (locatie, catering, fotograaf...) met status (nog bepalen, favoriet, in gesprek, geboekt, niet nodig) en contactgegevens.",
    scope: "read",
    input: z.object({ coupleId: uuid }),
    async run({ coupleId }) {
      await couple(coupleId);
      return (await suppliersFor(coupleId)).map((s) => ({
        category: s.category_name,
        status: SUPPLIER_STATUS[s.status],
        name: s.name || null,
        contactPerson: s.contact_person || null,
        phone: s.phone || null,
        email: s.email || null,
        website: s.website || null,
        notes: s.notes || null,
        documents: s.documents,
      }));
    },
  }),

  defineTool({
    name: "ws_costs",
    title: "Wedding Space: kosten en budget",
    description: "Het kostenoverzicht van een bruidspaar: per post het budget, het werkelijke bedrag, aanbetaling, vervaldatums en of het betaald is, plus totalen. Bedragen in euro.",
    scope: "read",
    input: z.object({ coupleId: uuid }),
    async run({ coupleId }) {
      const c = await couple(coupleId);
      const lines = await costLines(coupleId);
      const totals = budgetTotals(lines);
      return {
        totalBudgetEuro: euro(c.total_budget_cents),
        totals: { budgetEuro: euro(totals.budget), actualEuro: euro(totals.actual), paidEuro: euro(totals.paid), outstandingEuro: euro(totals.outstanding) },
        lines: lines.map((l) => ({
          name: l.name,
          category: l.category,
          supplier: l.supplier || null,
          budgetEuro: euro(l.budget_cents),
          actualEuro: euro(l.actual_cents),
          depositEuro: euro(l.deposit_cents),
          depositDue: l.deposit_due,
          paymentDue: l.payment_due,
          paid: l.paid,
        })),
      };
    },
  }),

  defineTool({
    name: "ws_rsvp_summary",
    title: "Wedding Space: RSVP",
    description: "De RSVP-reacties van een bruidspaar: hoeveel gasten komen, niet komen of deels komen, het aantal personen, dieetwensen en de laatste reacties.",
    scope: "read",
    input: z.object({ coupleId: uuid, recent: z.number().int().min(0).max(200).default(20) }),
    async run({ coupleId, recent }) {
      await couple(coupleId);
      const rows = await query<{ first_name: string; last_name: string; attending: string; party_count: number; diet: string; relation: string; created_at: Date; form: string | null }>(
        `select r.first_name, r.last_name, r.attending, r.party_count, r.diet, r.relation, r.created_at, f.name as form
           from rsvp_responses r left join rsvp_forms f on f.id = r.form_id
          where r.couple_id = $1 order by r.created_at desc`,
        [coupleId],
      );
      const sum = (kind: string) => rows.filter((r) => r.attending === kind).reduce((n, r) => n + (r.party_count || 1), 0);
      return {
        responses: rows.length,
        peopleComing: sum("yes"),
        peoplePartly: sum("partial"),
        peopleNotComing: sum("no"),
        diets: rows.filter((r) => r.diet.trim()).map((r) => ({ name: `${r.first_name} ${r.last_name}`.trim(), diet: r.diet })),
        latest: rows.slice(0, recent).map((r) => ({ name: `${r.first_name} ${r.last_name}`.trim(), attending: r.attending, people: r.party_count, relation: r.relation, form: r.form, at: r.created_at })),
      };
    },
  }),

  defineTool({
    name: "ws_runsheet",
    title: "Wedding Space: draaiboek",
    description: "Het draaiboek van een bruidspaar: de tabbladen en de tijdlijn van de dag (tijd, wie, wat, info, locatie en regenlocatie).",
    scope: "read",
    input: z.object({ coupleId: uuid }),
    async run({ coupleId }) {
      await couple(coupleId);
      const tabs = await tabsFor(coupleId);
      const schedules = tabs.filter((t) => t.kind === "schedule");
      const rows = await rowsFor(coupleId);
      return {
        tabs: tabs.map((t) => ({ id: t.id, title: t.title, kind: t.kind })),
        schedule: schedules.map((t) => ({
          tab: t.title,
          rows: sortSchedule(rows.filter((r) => r.tab_id === t.id)).map((r) => ({
            time: r.at_time,
            who: [r.who, ...(r.people ?? [])].filter(Boolean).join(", "),
            what: r.what,
            info: r.info,
            location: r.location,
            rainLocation: r.rain_location,
          })),
        })),
      };
    },
  }),

  defineTool({
    name: "ws_recent_activity",
    title: "Wedding Space: activiteit",
    description: "Wat bruidsparen recent in hun portaal hebben gedaan (taken afgevinkt, vragen gesteld, gegevens ingevuld), nieuwste eerst.",
    scope: "read",
    input: z.object({ coupleId: uuid.optional(), limit: z.number().int().min(1).max(200).default(40) }),
    async run({ coupleId, limit }) {
      const rows = await query<{ action: string; at: Date; couple_id: string | null; partner1_first: string | null; partner2_first: string | null }>(
        `select x.action, x.at, x.couple_id, c.partner1_first, c.partner2_first
           from activity x left join couples c on c.id = x.couple_id
          where ($1::uuid is null or x.couple_id = $1) order by x.at desc limit $2`,
        [coupleId ?? null, limit],
      );
      return rows.map((r) => ({
        at: r.at,
        couple: r.couple_id ? coupleRef({ id: r.couple_id, partner1_first: r.partner1_first ?? "", partner2_first: r.partner2_first ?? "" }) : null,
        action: r.action,
      }));
    },
  }),

  defineTool({
    name: "ws_list_packages",
    title: "Wedding Space: pakketten",
    description: "De pakketten van Estasi Weddings (weddingplanner, ceremoniemeester, openingsdans) met prijs, aantal meetings en beschrijving.",
    scope: "read",
    input: z.object({ includeArchived: z.boolean().default(false) }),
    async run({ includeArchived }) {
      const rows = await query<Package>("select * from packages where $1 or not archived order by position, name", [includeArchived]);
      return rows.map((p) => ({ id: p.id, name: p.name, variant: p.variant, kind: p.kind, priceEuro: euro(p.price_cents), meetings: p.meetings, suppliers: p.suppliers_enabled, description: p.description, archived: p.archived }));
    },
  }),

  // Writes ---------------------------------------------------------------------------------

  defineTool({
    name: "ws_add_task",
    title: "Wedding Space: taak toevoegen",
    description: "Zet een taak op het takenbord van een bruidspaar, in de kolom couple (het bruidspaar), sabine (Sabine zelf), bride of groom. Het bruidspaar ziet taken in hun portaal.",
    scope: "write",
    input: z.object({ coupleId: uuid, lane, title: z.string().trim().min(1).max(200), deadline: date.optional(), notes: z.string().max(2000).default("") }),
    async run({ coupleId, lane: taskLane, title, deadline, notes }, ctx) {
      const c = await couple(coupleId);
      const row = await one<{ id: string }>(
        `insert into tasks (couple_id, lane, title, deadline, notes, position, created_by)
         values ($1, $2, $3, $4, $5, coalesce((select max(position) + 1 from tasks where couple_id = $1 and lane = $2), 1), $6)
         returning id`,
        [c.id, taskLane, title, deadline ?? null, notes, ctx.user.id],
      );
      return { taskId: row?.id, message: `Taak toegevoegd bij ${coupleName(c)} in de kolom ${LANE_LABELS[taskLane]}.` };
    },
  }),

  defineTool({
    name: "ws_set_task_done",
    title: "Wedding Space: taak afvinken",
    description: "Vinkt een taak af (done=true) of zet hem weer open (done=false).",
    scope: "write",
    input: z.object({ taskId: uuid, done: z.boolean().default(true) }),
    async run({ taskId, done }, ctx) {
      const task = await one<{ title: string }>(
        `update tasks set done_at = case when $2 then coalesce(done_at, now()) else null end,
                          done_by = case when $2 then $3::text else null end,
                          done_by_name = case when $2 then $4 else '' end
          where id = $1 returning title`,
        [taskId, done, ctx.user.id, ctx.user.name],
      );
      if (!task) throw new ToolError("Taak niet gevonden.");
      return done ? `Afgevinkt: ${task.title}` : `Staat weer open: ${task.title}`;
    },
  }),

  defineTool({
    name: "ws_answer_question",
    title: "Wedding Space: vraag beantwoorden",
    description: "Beantwoordt een vraag van een bruidspaar. Het antwoord staat daarna in hun portaal en beide partners krijgen een e-mail dat er een antwoord klaarstaat (het antwoord zelf staat niet in de mail). Laat de gebruiker het antwoord eerst goedkeuren.",
    scope: "write",
    openWorld: true,
    input: z.object({ questionId: uuid, answer: z.string().trim().min(1).max(6000), notify: z.boolean().default(true).describe("E-mail naar het bruidspaar sturen") }),
    async run({ questionId, answer, notify }, ctx) {
      const q = await one<{ couple_id: string }>(
        "update questions set answer = $2, answered_by = $3, answered_at = now() where id = $1 returning couple_id",
        [questionId, answer, ctx.user.id],
      );
      if (!q) throw new ToolError("Vraag niet gevonden.");
      if (!notify) return "Antwoord opgeslagen, zonder e-mail.";
      const c = await couple(q.couple_id);
      const recipients = [
        ...new Set(
          [...(await coupleMembers(c.id)).map((a) => a.email), c.partner1_email, c.partner2_email].map((e) => e.trim().toLowerCase()).filter(Boolean),
        ),
      ];
      const sent = recipients.length
        ? await sendMail({
            to: recipients,
            replyTo: ctx.user.email,
            subject: "Er staat een antwoord voor jullie klaar",
            text: `Hoi ${coupleName(c)},\n\nSabine heeft jullie vraag in Your Wedding Space beantwoord. Log in om het antwoord te lezen:\n${appUrl()}/k/${c.id}#vragenblok`,
          })
        : false;
      return sent ? "Antwoord opgeslagen. Het bruidspaar krijgt een melding per e-mail." : "Antwoord opgeslagen. Er is geen e-mail verstuurd (geen adres, of e-mail staat niet ingesteld).";
    },
  }),

  defineTool({
    name: "ws_add_appointment",
    title: "Wedding Space: afspraak of deadline",
    description: "Zet een afspraak of deadline in de agenda van een bruidspaar. Met withSabine=true is het een afspraak met Sabine en staat hij ook in haar eigen agenda.",
    scope: "write",
    input: z.object({
      coupleId: uuid,
      kind: z.enum(["appointment", "deadline"]).default("appointment"),
      title: z.string().trim().min(1).max(200),
      date,
      time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      withSabine: z.boolean().default(false),
      notes: z.string().max(2000).default(""),
    }),
    async run({ coupleId, kind, title, date: onDate, time, withSabine, notes }, ctx) {
      const c = await couple(coupleId);
      const row = await one<{ id: string }>(
        `insert into appointments (couple_id, kind, title, on_date, at_time, with_sabine, notes, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [c.id, kind, title, onDate, time ?? "", withSabine, notes, ctx.user.id],
      );
      return { appointmentId: row?.id, message: `${kind === "deadline" ? "Deadline" : "Afspraak"} op ${formatDate(onDate)} toegevoegd bij ${coupleName(c)}.` };
    },
  }),

  defineTool({
    name: "ws_update_meeting",
    title: "Wedding Space: meeting bijwerken",
    description: "Werkt een meeting bij: status (to_plan, planned, done, skipped), datum en/of samenvatting. De samenvatting is zichtbaar voor het bruidspaar onder Jullie pakket. Alleen meegegeven velden veranderen.",
    scope: "write",
    input: z.object({
      meetingId: uuid,
      status: z.enum(["to_plan", "planned", "done", "skipped"]).optional(),
      plannedOn: date.nullable().optional(),
      summary: z.string().max(20_000).optional(),
    }),
    async run({ meetingId, status, plannedOn, summary }) {
      const m = await one<{ title: string }>(
        `update meetings set status = coalesce($2, status),
                planned_on = case when $3 then $4::date else planned_on end,
                summary = coalesce($5, summary)
          where id = $1 returning title`,
        [meetingId, status ?? null, plannedOn !== undefined, plannedOn ?? null, summary ?? null],
      );
      if (!m) throw new ToolError("Meeting niet gevonden.");
      return `${m.title} bijgewerkt.`;
    },
  }),
];
