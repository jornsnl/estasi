import "server-only";
import type { MealGuest, MealRow } from "./meals";

/** Everyone with an allergy or diet: guests from the RSVP plus people from the table. */
export function allergyList(guests: MealGuest[], rows: MealRow[]) {
  return [
    ...guests.filter((g) => g.diet.trim()).map((g) => ({ name: g.name, kid: g.is_kid, group: g.group, diet: g.diet.trim() })),
    ...rows.filter((r) => r.kind !== "rsvp" && r.diet.trim()).map((r) => ({ name: r.name, kid: false, group: r.kind === "person" ? r.role || "Persoon" : "Groep", diet: r.diet.trim() })),
  ];
}
