"use server";

import { requireCouple, type CoupleContext } from "@/lib/ws/access";
import { logActivity } from "@/lib/ws/couples";
import { isUuid, one, query } from "@/lib/ws/db";
import { parseMoney } from "@/lib/ws/format";
import { dateField, done, str } from "@/lib/ws/redirect";

/**
 * Begroting (in the assignment) and the cost overview. The couple and Sabine
 * both add, change and delete; the Estasi package lines only Sabine, and
 * their amount always follows the package price.
 */

type Ok = { ok: boolean; error?: string };
async function note(ctx: CoupleContext, action: string) {
  if (!ctx.isAdmin) await logActivity(ctx.couple.id, ctx.account.id, action);
}
function money(raw: string): number | null | "bad" {
  try {
    return parseMoney(raw);
  } catch {
    return "bad";
  }
}
async function lineOf(ctx: CoupleContext, id: string) {
  if (!isUuid(id)) return null;
  return one<{ id: string; kind: string }>("select id, kind from budget_items where id = $1 and couple_id = $2", [id, ctx.couple.id]);
}

// Budget (assignment "Budgetplanning & prioriteiten") ----------------------------------------------------

export async function setTotalBudget(coupleId: string, value: string): Promise<Ok> {
  const ctx = await requireCouple(coupleId);
  const cents = money(value);
  if (cents === "bad") return { ok: false, error: "Vul een bedrag in, bijvoorbeeld 25.000" };
  await query("update couples set total_budget_cents = $2 where id = $1", [ctx.couple.id, cents]);
  await note(ctx, "Totaalbudget aangepast");
  return { ok: true };
}

/** "Begroot bedrag" of a category or own part: only from the budget table, it then shows on the cost overview. */
export async function setPlanned(coupleId: string, itemId: string, value: string): Promise<Ok> {
  const ctx = await requireCouple(coupleId);
  const line = await lineOf(ctx, itemId);
  if (!line || (line.kind !== "category" && line.kind !== "own")) return { ok: false, error: "Niet gevonden." };
  const cents = money(value);
  if (cents === "bad") return { ok: false, error: "Vul een bedrag in." };
  await query("update budget_items set budget_cents = $2 where id = $1", [line.id, cents ?? 0]);
  return { ok: true };
}

export async function addOwnPart(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  const back = str(formData, "back", 300).startsWith(`/k/${ctx.couple.id}/`) ? str(formData, "back", 300) : `/k/${ctx.couple.id}/kosten`;
  const name = str(formData, "name", 200);
  if (!name) done(back, "Vul het onderdeel in, bijvoorbeeld Trouwkaarten.", true);
  const cents = money(str(formData, "budget", 30));
  if (cents === "bad") done(back, "Vul een geldig bedrag in.", true);
  await query(
    `insert into budget_items (couple_id, kind, name, category, budget_cents, position)
     values ($1, 'own', $2, $2, $3, coalesce((select max(position) + 1 from budget_items where couple_id = $1), 1))`,
    [ctx.couple.id, name, cents ?? 0],
  );
  await note(ctx, `Begroting: ${name} toegevoegd`);
  done(back, `${name} toegevoegd aan de begroting.`);
}

// Cost overview ---------------------------------------------------------------------------------------------

/** "Kostenpost toevoegen": extra costs on top of the budget. */
export async function addExtraCost(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  const back = `/k/${ctx.couple.id}/kosten`;
  const name = str(formData, "name", 200);
  if (!name) done(back, "Geef de kostenpost een naam.", true);
  const actual = money(str(formData, "actual", 30));
  const deposit = money(str(formData, "deposit", 30));
  if (actual === "bad" || deposit === "bad") done(back, "Controleer de bedragen.", true);
  await query(
    `insert into budget_items (couple_id, kind, name, category, supplier, actual_cents, deposit_cents, payment_due, paid, position)
     values ($1, 'extra', $2, $3, $4, $5, $6, $7, $8, coalesce((select max(position) + 1 from budget_items where couple_id = $1), 1))`,
    [ctx.couple.id, name, str(formData, "category", 100), str(formData, "supplier", 200), actual, deposit, dateField(formData, "paymentDue"), formData.get("paid") === "on"],
  );
  await note(ctx, `Kostenpost toegevoegd: ${name}`);
  done(back, "Kostenpost toegevoegd.");
}

type Field = "name" | "category" | "supplier" | "actual" | "deposit" | "payment_due" | "paid";

/** One cell of the cost table. Begroot, Verschil and Resterend are never typed in here. */
export async function updateCost(coupleId: string, itemId: string, field: Field, value: string | boolean): Promise<Ok> {
  const ctx = await requireCouple(coupleId);
  if (!ctx.planning) return { ok: false, error: "Niet beschikbaar." };
  const line = await lineOf(ctx, itemId);
  if (!line) return { ok: false, error: "Niet gevonden." };
  if (line.kind === "package" && !ctx.isAdmin) return { ok: false, error: "Het pakket van Estasi past alleen Sabine aan." };
  if (line.kind === "package" && (field === "name" || field === "category" || field === "supplier" || field === "actual")) {
    return { ok: false, error: "Naam en bedrag volgen het pakket." };
  }
  if ((field === "name" || field === "category") && line.kind === "category") return { ok: false, error: "Deze regel volgt de categorie bij Jullie leveranciers." };
  let column: string;
  let clean: unknown;
  switch (field) {
    case "name": column = "name"; clean = String(value).trim().slice(0, 200); if (!clean) return { ok: false, error: "Mag niet leeg zijn." }; break;
    case "category": column = "category"; clean = String(value).trim().slice(0, 100); break;
    case "supplier": column = "supplier"; clean = String(value).trim().slice(0, 200); break;
    case "actual":
    case "deposit": {
      const cents = money(String(value));
      if (cents === "bad") return { ok: false, error: "Vul een geldig bedrag in." };
      column = field === "actual" ? "actual_cents" : "deposit_cents";
      clean = cents;
      break;
    }
    case "payment_due": column = "payment_due"; clean = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : null; break;
    case "paid": column = "paid"; clean = Boolean(value); break;
    default: return { ok: false, error: "Onbekend veld." };
  }
  // The column comes from the switch above, never from the browser.
  await query(`update budget_items set ${column} = $2 where id = $1`, [line.id, clean]);
  return { ok: true };
}

export async function deleteCost(formData: FormData) {
  const ctx = await requireCouple(str(formData, "coupleId", 40));
  const back = str(formData, "back", 300).startsWith(`/k/${ctx.couple.id}/`) ? str(formData, "back", 300) : `/k/${ctx.couple.id}/kosten`;
  const line = await lineOf(ctx, str(formData, "itemId", 40));
  if (!line || line.kind === "package" || line.kind === "category") done(back, "Deze regel kan niet verwijderd worden.", true);
  await query("delete from budget_items where id = $1", [line.id]);
  done(back, "Verwijderd.");
}
