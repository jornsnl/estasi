import { describe, expect, it } from "vitest";
import {
  cleanChildren,
  coverCounts,
  invitationTotals,
  mealTotal,
  notResponded,
  partialCount,
  partialRowsIndex,
  partyLabel,
  planChildSync,
  rsvpRowCount,
  type MealCountGuest,
} from "@/lib/ws/guest-counts";

describe("kinderen bij een uitnodiging", () => {
  it("schrijft het aantal personen met kinderen uit", () => {
    expect(partyLabel(4, 2)).toBe("4 personen, waarvan 2 kinderen");
    expect(partyLabel(3, 1)).toBe("3 personen, waarvan 1 kind");
    expect(partyLabel(1, 0)).toBe("1 persoon");
    expect(partyLabel(2, 0)).toBe("2 personen");
  });

  it("heeft nooit meer kinderen dan personen", () => {
    expect(cleanChildren(["  Tim ", "Sara", "Pim"], 2)).toEqual(["Tim", "Sara"]);
    expect(cleanChildren(["", "Sara"], 4)).toEqual(["", "Sara"]);
  });

  it("telt volwassenen en kinderen per gastengroep, kinderen binnen het totaal", () => {
    const groups = [{ id: "d", name: "Daggasten" }, { id: "a", name: "Avondgasten" }];
    const totals = invitationTotals(
      [
        { party_size: 4, kids: 2, group_id: "d" },
        { party_size: 2, kids: 0, group_id: "d" },
        { party_size: 3, kids: 1, group_id: "a" },
        { party_size: 1, kids: 0, group_id: null },
      ],
      groups,
    );
    expect(totals).toEqual([
      { id: "d", name: "Daggasten", adults: 4, kids: 2 },
      { id: "a", name: "Avondgasten", adults: 2, kids: 1 },
      { id: "", name: "Zonder groep", adults: 1, kids: 0 },
    ]);
  });

  it("telt wie nog niet heeft gereageerd", () => {
    expect(notResponded([{ party_size: 2, responded: "no" }, { party_size: 4, responded: "yes" }, { party_size: 3, responded: "no" }, { party_size: 1, responded: "maybe" }])).toEqual({ households: 2, people: 5 });
  });
});

describe("voorblad draaiboek", () => {
  it("telt alleen aangemelde gasten, dag en avond, volwassenen en kinderen", () => {
    const c = coverCounts([
      { attendance: "yes", is_kid: false, group_kind: "day" },
      { attendance: "yes", is_kid: true, group_kind: "day" },
      { attendance: "partial", is_kid: false, group_kind: "day" },
      { attendance: "no", is_kid: false, group_kind: "day" },
      { attendance: "yes", is_kid: false, group_kind: "evening" },
      { attendance: "yes", is_kid: true, group_kind: "evening" },
      { attendance: "yes", is_kid: false, group_kind: "custom" },
      { attendance: "yes", is_kid: false, group_kind: null },
    ]);
    expect(c.day).toEqual({ adults: 4, kids: 1 });
    expect(c.evening).toEqual({ adults: 1, kids: 1 });
    expect(c.total).toBe(7);
    expect(c.total).toBe(c.day.adults + c.day.kids + c.evening.adults + c.evening.kids);
  });
});

describe("wie eet er mee", () => {
  const g = (id: string, group_id: string, is_kid: boolean, attendance: string, excluded: string[] = []): MealCountGuest => ({ id, group_id, is_kid, attendance, excluded });
  const guests = [
    g("1", "day", false, "yes"),
    g("2", "day", false, "yes"),
    g("3", "day", true, "yes"),
    g("4", "day", false, "partial", ["ontbijt"]),
    g("5", "day", true, "partial", ["diner"]),
    g("6", "day", false, "no"),
    g("7", "eve", false, "yes"),
  ];

  it("telt deel-van-de-dag-gasten niet ook in hun groep", () => {
    expect(rsvpRowCount(guests, { group_id: "day", kids: false }, "diner")).toBe(2);
    expect(rsvpRowCount(guests, { group_id: "day", kids: true }, "diner")).toBe(1);
  });

  it("telt per maaltijd alleen de aangevinkte deel-van-de-dag-gasten", () => {
    expect(partialCount(guests, false, "ontbijt")).toBe(0);
    expect(partialCount(guests, false, "diner")).toBe(1);
    expect(partialCount(guests, true, "diner")).toBe(0);
    expect(partialCount(guests, true, "ontbijt")).toBe(1);
  });

  it("neemt deel van de dag mee in het totaal, zonder dubbeltelling", () => {
    const rows = [
      { kind: "person" as const, cells: { diner: { checked: true, count: 0 } } },
      { kind: "group" as const, cells: { diner: { checked: false, count: 3 } } },
      { kind: "rsvp" as const, cells: { diner: { checked: true, count: rsvpRowCount(guests, { group_id: "day", kids: false }, "diner") } } },
      { kind: "rsvp" as const, cells: { diner: { checked: true, count: rsvpRowCount(guests, { group_id: "day", kids: true }, "diner") } } },
      { kind: "rsvp" as const, cells: { diner: { checked: false, count: rsvpRowCount(guests, { group_id: "eve", kids: false }, "diner") } } },
    ];
    // 1 person + 3 group + 2 adults + 1 kid + 1 partial adult (the partial kid skips the dinner); evening is off.
    expect(mealTotal(rows, guests, "diner")).toBe(8);
  });

  it("zet deel van de dag direct onder de daggasten", () => {
    const rows = [
      { kind: "person" },
      { kind: "rsvp", group_kind: "day" },
      { kind: "rsvp", group_kind: "day" },
      { kind: "rsvp", group_kind: "evening" },
    ];
    expect(partialRowsIndex(rows)).toBe(3);
    expect(partialRowsIndex([{ kind: "person" }, { kind: "rsvp", group_kind: "evening" }])).toBe(1);
    expect(partialRowsIndex([{ kind: "group" }])).toBe(1);
  });
});

describe("kinderen worden gasten", () => {
  const response = { id: "r1", attending: "yes" as const, partial_note: "", form_id: "f1", group_id: "day", relation: "Familie" };
  const invitation = { id: "i1", names: "Jan & Els de Vries", group_id: "day", response_id: "r1" };
  const rsvp = (id: string, first: string, last: string, is_kid = false) => ({ id, response_id: "r1", first_name: first, last_name: last, is_kid, invitation_child_id: null });

  it("maakt een gast voor een kind dat de RSVP niet noemt", () => {
    const plan = planChildSync({
      invitations: [invitation],
      children: [{ id: "c1", invitation_id: "i1", name: "Tim de Vries", linked_guest_id: null, position: 1 }],
      responses: [response],
      guests: [rsvp("g1", "Jan", "de Vries"), rsvp("g2", "Els", "de Vries")],
    });
    expect(plan.links).toEqual([]);
    expect(plan.removals).toEqual([]);
    expect(plan.upserts).toHaveLength(1);
    expect(plan.upserts[0]).toMatchObject({ childId: "c1", guestId: null, responseId: "r1", groupId: "day", firstName: "Tim", lastName: "de Vries", attendance: "yes" });
  });

  it("zet kinderen in de groep van wie ze aanmeldde, ook als Sabine die heeft verplaatst", () => {
    const plan = planChildSync({
      invitations: [invitation],
      children: [{ id: "c1", invitation_id: "i1", name: "Tim de Vries", linked_guest_id: null, position: 1 }],
      responses: [response],
      guests: [{ ...rsvp("g1", "Jan", "de Vries"), group_id: "family" }],
    });
    expect(plan.upserts[0]).toMatchObject({ childId: "c1", groupId: "family" });
  });

  it("koppelt een kind dat al via de RSVP is aangemeld, zodat niemand dubbel telt", () => {
    const plan = planChildSync({
      invitations: [invitation],
      children: [
        { id: "c1", invitation_id: "i1", name: "Tim", linked_guest_id: null, position: 1 },
        { id: "c2", invitation_id: "i1", name: "Sara de Vries", linked_guest_id: null, position: 2 },
      ],
      responses: [response],
      guests: [rsvp("g1", "Jan", "de Vries"), rsvp("g3", "Tim", "de Vries", true), rsvp("g4", "Sara", "de Vries")],
    });
    expect(plan.links).toEqual([{ childId: "c1", guestId: "g3" }, { childId: "c2", guestId: "g4" }]);
    expect(plan.upserts).toEqual([]);
  });

  it("koppelt een volwassene niet alleen op voornaam", () => {
    const plan = planChildSync({
      invitations: [invitation],
      children: [{ id: "c1", invitation_id: "i1", name: "Jan", linked_guest_id: null, position: 1 }],
      responses: [response],
      guests: [rsvp("g1", "Jan", "de Vries")],
    });
    expect(plan.links).toEqual([]);
    expect(plan.upserts).toHaveLength(1);
  });

  it("geen gast zolang het huishouden niet heeft gereageerd of afzegt", () => {
    const made = { id: "k1", response_id: "r1", first_name: "Tim", last_name: "", is_kid: true, invitation_child_id: "c1" };
    const child = { id: "c1", invitation_id: "i1", name: "Tim", linked_guest_id: null, position: 1 };
    const none = planChildSync({ invitations: [{ ...invitation, response_id: null }], children: [child], responses: [response], guests: [made] });
    expect(none).toEqual({ links: [], upserts: [], removals: ["k1"] });
    const declined = planChildSync({ invitations: [invitation], children: [child], responses: [{ ...response, attending: "no" }], guests: [made] });
    expect(declined.removals).toEqual(["k1"]);
    expect(declined.upserts).toEqual([]);
  });

  it("werkt een eerder gemaakte gast bij en geeft een kind zonder naam een naam", () => {
    const plan = planChildSync({
      invitations: [invitation],
      children: [{ id: "c1", invitation_id: "i1", name: "", linked_guest_id: null, position: 1 }],
      responses: [{ ...response, attending: "partial", partial_note: "Vanaf 17:00" }],
      guests: [{ id: "k1", response_id: "r1", first_name: "Tim", last_name: "", is_kid: true, invitation_child_id: "c1" }],
    });
    expect(plan.upserts[0]).toMatchObject({ guestId: "k1", firstName: "Kind 1", attendance: "partial", partialNote: "Vanaf 17:00" });
  });
});
