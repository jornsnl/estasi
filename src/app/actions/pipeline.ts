"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/session";
import { isUuid } from "@/lib/db";
import { STAGE_LABELS, isInterest, isSource, isStage, parseProbability, type Stage } from "@/lib/pipeline/rules";
import { addNote, convertToCouple, createLead, deleteLead, moveLead, updateLead, type LeadFields } from "@/lib/pipeline/server";
import { parseMoney } from "@/lib/ws/format";
import { dateField, done, str } from "@/lib/ws/redirect";

/** Salespipeline in the beheer (/beheer/pipeline). The checks live in src/lib/pipeline/server.ts. */

const BOARD = "/beheer/pipeline";
const leadPage = (id: string) => `${BOARD}/${id}`;

function refresh(id?: string) {
  revalidatePath(BOARD);
  if (id) revalidatePath(leadPage(id));
  // The follow-up count in the menu.
  revalidatePath("/beheer", "layout");
}

/** The fields of the lead form; throws a readable message for an amount or chance that does not parse. */
function fieldsFrom(formData: FormData): Omit<LeadFields, "title"> & { title: string } {
  const interest = str(formData, "interest", 40);
  const source = str(formData, "source", 40);
  const guests = str(formData, "guests", 6);
  return {
    title: str(formData, "title", 200),
    contact_name: str(formData, "contactName", 120),
    partner_name: str(formData, "partnerName", 120),
    email: str(formData, "email", 200),
    phone: str(formData, "phone", 40),
    instagram: str(formData, "instagram", 200),
    source_note: str(formData, "sourceNote", 300),
    interest: isInterest(interest) ? interest : "weddingplanning",
    source: isSource(source) ? source : "handmatig",
    wedding_date: dateField(formData, "weddingDate"),
    location: str(formData, "location", 200),
    guests: guests && Number.isInteger(Number(guests)) ? Number(guests) : null,
    value_cents: parseMoney(str(formData, "value", 20)),
    probability: parseProbability(str(formData, "probability", 6)),
    notes: str(formData, "notes", 5000),
    next_action: str(formData, "nextAction", 300),
    next_action_date: dateField(formData, "nextActionDate"),
    lost_reason: str(formData, "lostReason", 300),
  };
}

function safeFields(formData: FormData, back: string) {
  try {
    return fieldsFrom(formData);
  } catch (err) {
    done(back, err instanceof Error ? err.message : "Controleer de invoer.", true);
  }
}

export async function createLeadAction(formData: FormData) {
  await requireOwner();
  const back = `${BOARD}?nieuw=1`;
  const stage = str(formData, "stage", 20);
  const result = await createLead({ ...safeFields(formData, back), stage: isStage(stage) ? stage : "nieuw" });
  if (!result.ok) done(back, result.error, true);
  refresh();
  done(leadPage(result.value.id), "Lead aangemaakt.");
}

export async function updateLeadAction(formData: FormData) {
  await requireOwner();
  const id = str(formData, "leadId", 40);
  if (!isUuid(id)) done(BOARD, "Lead niet gevonden.", true);
  const result = await updateLead(id, safeFields(formData, leadPage(id)));
  if (!result.ok) done(leadPage(id), result.error, true);
  refresh(id);
  done(leadPage(id), "Opgeslagen.");
}

/** From the detail page: one click to a stage, at the top of the column. */
export async function setStageAction(formData: FormData) {
  await requireOwner();
  const id = str(formData, "leadId", 40);
  const stage = str(formData, "stage", 20);
  if (!isUuid(id) || !isStage(stage)) done(BOARD, "Ongeldige fase.", true);
  const result = await moveLead(id, stage, { lostReason: str(formData, "lostReason", 300) });
  if (!result.ok) done(leadPage(id), result.error, true);
  refresh(id);
  done(leadPage(id), `Naar ${STAGE_LABELS[stage]}.`);
}

export type MoveResult = { ok: true } | { ok: false; error: string };

/** From the board (dragging or the stage menu on a card): to a stage and a place in the column. */
export async function moveLeadAction(id: string, stage: Stage, index: number): Promise<MoveResult> {
  await requireOwner();
  if (!isUuid(id) || !isStage(stage) || !Number.isInteger(index) || index < 0) return { ok: false, error: "Ongeldige verplaatsing." };
  const result = await moveLead(id, stage, { index });
  if (!result.ok) return result;
  refresh(id);
  return { ok: true };
}

export async function addNoteAction(formData: FormData) {
  const user = await requireOwner();
  const id = str(formData, "leadId", 40);
  const result = await addNote(id, str(formData, "body", 5000), user.id);
  if (!result.ok) done(isUuid(id) ? leadPage(id) : BOARD, result.error, true);
  revalidatePath(leadPage(id));
  done(`${leadPage(id)}#tijdlijn`, "Notitie toegevoegd.");
}

export async function convertLeadAction(formData: FormData) {
  const user = await requireOwner();
  const id = str(formData, "leadId", 40);
  const result = await convertToCouple(id, user.id);
  if (!result.ok) done(isUuid(id) ? leadPage(id) : BOARD, result.error, true);
  refresh(id);
  revalidatePath("/beheer/bruidsparen");
  done(
    `/k/${result.value.coupleId}/gegevens`,
    result.value.created
      ? "Bruidspaar aangemaakt als concept met de gegevens van de lead. Kies nog het pakket; het bruidspaar ziet niets totdat je het deelt."
      : "De lead is gekoppeld aan het bestaande bruidspaar met hetzelfde e-mailadres.",
  );
}

export async function deleteLeadAction(formData: FormData) {
  await requireOwner();
  const id = str(formData, "leadId", 40);
  const removed = await deleteLead(id);
  refresh();
  done(BOARD, removed ? "Lead verwijderd." : "Lead niet gevonden.", !removed);
}
