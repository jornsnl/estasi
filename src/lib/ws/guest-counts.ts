// Who counts where: guests, children and "deel van de dag", for the guest list,
// the cover of the run sheet and "Wie eet er mee". Pure, so it is unit tested.

import { normName, splitName } from "./pure";

export type Attendance = "yes" | "no" | "partial";
export type GroupKind = "day" | "evening" | "custom";

// Invitations and children ---------------------------------------------------------------------------

/** At most as many children as people in the household; names trimmed and short. */
export function cleanChildren(names: string[], partySize: number): string[] {
  return names.map((n) => String(n ?? "").trim().replace(/\s+/g, " ").slice(0, 120)).slice(0, Math.max(0, partySize));
}

/** "4 personen, waarvan 2 kinderen", "1 persoon", "3 personen, waarvan 1 kind". */
export function partyLabel(partySize: number, kids: number): string {
  const people = `${partySize} ${partySize === 1 ? "persoon" : "personen"}`;
  return kids > 0 ? `${people}, waarvan ${kids} ${kids === 1 ? "kind" : "kinderen"}` : people;
}

export interface CountRow {
  adults: number;
  kids: number;
}

/**
 * Totals at the top of the invitation list: per guest group the adults and
 * children invited (children count in the household's number of people).
 */
export function invitationTotals(
  invitations: { party_size: number; kids: number; group_id: string | null }[],
  groups: { id: string; name: string }[],
): ({ id: string; name: string } & CountRow)[] {
  const blocks = [...groups.map((g) => ({ id: g.id, name: g.name })), { id: "", name: "Zonder groep" }];
  return blocks
    .map((b) => {
      const list = invitations.filter((i) => (b.id ? i.group_id === b.id : !i.group_id || !groups.some((g) => g.id === i.group_id)));
      const kids = list.reduce((n, i) => n + Math.min(i.kids, i.party_size), 0);
      return { ...b, adults: list.reduce((n, i) => n + i.party_size, 0) - kids, kids };
    })
    .filter((b) => b.adults + b.kids > 0);
}

/** "Nog geen reactie": households (and their people) without a matched RSVP response. */
export function notResponded(invitations: { party_size: number; responded: "yes" | "maybe" | "no" }[]) {
  const open = invitations.filter((i) => i.responded === "no");
  return { households: open.length, people: open.reduce((n, i) => n + i.party_size, 0) };
}

// The cover of the run sheet ---------------------------------------------------------------------------

/**
 * Signed-up guests by day and evening, adults and children. Each guest is one
 * row in the guest list, so nobody is counted twice; declines do not count.
 * The evening group is "avond"; every other group (day, own groups) is "dag".
 */
export function coverCounts(guests: { attendance: string; is_kid: boolean; group_kind: GroupKind | null }[]) {
  const coming = guests.filter((g) => g.attendance !== "no");
  const count = (list: typeof coming): CountRow => ({ adults: list.filter((g) => !g.is_kid).length, kids: list.filter((g) => g.is_kid).length });
  const day = count(coming.filter((g) => g.group_kind !== "evening"));
  const evening = count(coming.filter((g) => g.group_kind === "evening"));
  return { day, evening, total: coming.length };
}

// Wie eet er mee ------------------------------------------------------------------------------------------

export interface MealCountGuest {
  id: string;
  group_id: string | null;
  is_kid: boolean;
  attendance: string;
  /** Moments this guest does not eat along. */
  excluded: string[];
}

/** RSVP group row (adults or children of one group): only those there the whole day. */
export function rsvpRowCount(guests: MealCountGuest[], row: { group_id: string | null; kids: boolean }, momentId: string): number {
  return guests.filter((g) => g.group_id === row.group_id && g.is_kid === row.kids && g.attendance === "yes" && !g.excluded.includes(momentId)).length;
}

/** "Deel van de dag, volwassenen" or "... kinderen": the partial guests ticked for this moment. */
export function partialCount(guests: MealCountGuest[], kids: boolean, momentId: string): number {
  return guests.filter((g) => g.attendance === "partial" && g.is_kid === kids && !g.excluded.includes(momentId)).length;
}

export interface MealCountRow {
  kind: "person" | "group" | "rsvp";
  cells: Record<string, { checked: boolean; count: number } | undefined>;
}

/**
 * Total for one moment: people ticked, numbers of own groups, RSVP groups
 * that are on, plus every partial guest ticked for it.
 */
export function mealTotal(rows: MealCountRow[], guests: MealCountGuest[], momentId: string): number {
  const fromRows = rows.reduce((n, r) => {
    const c = r.cells[momentId];
    if (!c) return n;
    if (r.kind === "person") return n + (c.checked ? 1 : 0);
    if (r.kind === "group") return n + c.count;
    return n + (c.checked ? c.count : 0);
  }, 0);
  return fromRows + partialCount(guests, false, momentId) + partialCount(guests, true, momentId);
}

/**
 * Where "Deel van de dag, volwassenen/kinderen" go in "Wie eet er mee": right
 * under the last row of a day group; without one, before the other RSVP rows.
 */
export function partialRowsIndex(rows: { kind: string; group_kind?: string | null }[]): number {
  let lastDay = -1;
  rows.forEach((r, i) => {
    if (r.kind === "rsvp" && r.group_kind === "day") lastDay = i;
  });
  if (lastDay >= 0) return lastDay + 1;
  const firstRsvp = rows.findIndex((r) => r.kind === "rsvp");
  return firstRsvp >= 0 ? firstRsvp : rows.length;
}

// Children who become guests ---------------------------------------------------------------------------------

export interface SyncChild {
  id: string;
  invitation_id: string;
  name: string;
  linked_guest_id: string | null;
  position: number;
}
export interface SyncGuest {
  id: string;
  response_id: string | null;
  first_name: string;
  last_name: string;
  is_kid: boolean;
  invitation_child_id: string | null;
  /** The group the guest is in now; children follow whoever signed them up. Optional for older callers. */
  group_id?: string | null;
}
export interface SyncInvitation {
  id: string;
  names: string;
  group_id: string | null;
  /** The RSVP response of this household, when it is certain (matched). */
  response_id: string | null;
}
export interface SyncResponse {
  id: string;
  attending: Attendance;
  partial_note: string;
  form_id: string | null;
  group_id: string | null;
  relation: string;
}
export interface GuestFromChild {
  childId: string;
  /** The guest made earlier for this child, to update; null to create one. */
  guestId: string | null;
  responseId: string;
  formId: string | null;
  groupId: string | null;
  firstName: string;
  lastName: string;
  attendance: Attendance;
  partialNote: string;
  relation: string;
  notes: string;
}

/**
 * What to do so that every child of a household that signed up is exactly one
 * guest: the child the RSVP already mentions (same full name, or a child with
 * the same first name) is linked to that guest; any other child gets a guest
 * of its own with the household's answer. Households that did not respond,
 * or declined, have no child guests.
 */
export function planChildSync(input: {
  invitations: SyncInvitation[];
  children: SyncChild[];
  responses: SyncResponse[];
  guests: SyncGuest[];
}): { links: { childId: string; guestId: string | null }[]; upserts: GuestFromChild[]; removals: string[] } {
  const links: { childId: string; guestId: string | null }[] = [];
  const upserts: GuestFromChild[] = [];
  const removals: string[] = [];
  const own = new Map(input.guests.filter((g) => g.invitation_child_id).map((g) => [g.invitation_child_id!, g]));
  const taken = new Set<string>();

  for (const inv of input.invitations) {
    const kids = input.children.filter((c) => c.invitation_id === inv.id).sort((a, b) => a.position - b.position);
    if (kids.length === 0) continue;
    const response = inv.response_id ? input.responses.find((r) => r.id === inv.response_id) : undefined;
    const coming = response && response.attending !== "no" ? response : undefined;
    const rsvpGuests = coming ? input.guests.filter((g) => g.response_id === coming.id && !g.invitation_child_id) : [];

    kids.forEach((child, i) => {
      const made = own.get(child.id);
      if (!coming) {
        if (made) removals.push(made.id);
        if (child.linked_guest_id) links.push({ childId: child.id, guestId: null });
        return;
      }
      const name = normName(child.name);
      const first = name.split(" ")[0] ?? "";
      const free = rsvpGuests.filter((g) => !taken.has(g.id));
      const full = (g: SyncGuest) => normName(`${g.first_name} ${g.last_name}`);
      const match = name
        ? free.find((g) => g.id === child.linked_guest_id && (full(g) === name || normName(g.first_name) === first)) ??
          free.find((g) => full(g) === name) ??
          free.find((g) => g.is_kid && normName(g.first_name) === first)
        : undefined;
      if (match) {
        taken.add(match.id);
        if (child.linked_guest_id !== match.id) links.push({ childId: child.id, guestId: match.id });
        if (made) removals.push(made.id);
        return;
      }
      if (child.linked_guest_id) links.push({ childId: child.id, guestId: null });
      const { first: firstName, last: lastName } = child.name.trim() ? splitName(child.name) : { first: `Kind ${i + 1}`, last: "" };
      upserts.push({
        childId: child.id,
        guestId: made?.id ?? null,
        responseId: coming.id,
        formId: coming.form_id,
        // The group of whoever signed the household up, as Sabine may have moved them since:
        // otherwise the children end up in another group and not under "Te plaatsen" with their parent.
        groupId: rsvpGuests.find((g) => g.group_id)?.group_id ?? inv.group_id ?? coming.group_id,
        firstName,
        lastName,
        attendance: coming.attending,
        partialNote: coming.attending === "partial" ? coming.partial_note : "",
        relation: coming.relation,
        notes: `Kind van ${inv.names} (uitnodigingslijst)`,
      });
    });
  }
  return { links, upserts, removals };
}
