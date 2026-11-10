"use server";

import { cookies } from "next/headers";
import { isUuid, one, query, tx } from "@/lib/ws/db";
import { requireCoupleAdmin } from "@/lib/ws/access";
import { requireOwner } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { endSessionsOf } from "@/lib/ws/sessions";
import { loginLink } from "@/lib/ws/logins";
import { activateCouple, addPackages, createCouple } from "@/lib/ws/couples";
import { deleteFiles, storeUpload, UploadError } from "@/lib/ws/files";
import { coupleName, formatDate, LANES, parseMoney } from "@/lib/ws/format";
import { sendMail } from "@/lib/ws/mail";
import { dateField, done, str } from "@/lib/ws/redirect";
import type { Couple, Lane, Package } from "@/lib/ws/types";

const email = (formData: FormData, name: string) => str(formData, name, 200).toLowerCase();
const validEmail = (value: string) => !value || /^\S+@\S+\.\S+$/.test(value);

// Couples ----------------------------------------------------------------------------------

export async function createCoupleAction(formData: FormData) {
  const admin = await requireOwner();
  const back = "/beheer/bruidsparen/nieuw";
  const partner1_first = str(formData, "partner1First", 80);
  const partner1_email = email(formData, "partner1Email");
  const partner2_email = email(formData, "partner2Email");
  if (!partner1_first) done(back, "Vul minstens de voornaam van één partner in.", true);
  if (!validEmail(partner1_email) || !validEmail(partner2_email)) done(back, "Controleer de e-mailadressen.", true);
  for (const address of [partner1_email, partner2_email].filter(Boolean)) {
    const existing = await getStore().getUserByEmail(address);
    if (existing && existing.role !== "couple") done(back, `${address} heeft al een account in de Academy. Gebruik een ander e-mailadres.`, true);
  }
  const packageIds = formData.getAll("packageIds").map(String).filter(isUuid).slice(0, 10);
  const packages = packageIds.length ? await query<Package>("select * from packages where id = any($1::uuid[])", [packageIds]) : [];
  const meetingsInput = Number(str(formData, "meetings", 3));
  // Several packages: the one with the most meetings decides (the opening dance has none).
  const meetings = Number.isInteger(meetingsInput) && meetingsInput >= 0 && meetingsInput <= 20 && str(formData, "meetings") !== ""
    ? meetingsInput
    : Math.max(0, ...packages.map((p) => p.meetings));

  // Feedback Sabine: the agreed price and whether the couple pays at once or in two halves.
  let agreed_price_cents: number | null = null;
  try {
    agreed_price_cents = parseMoney(str(formData, "agreedPrice", 20));
  } catch {
    done(back, "Vul de afgesproken prijs in als bedrag, bijvoorbeeld 2.450 of 2450,00.", true);
  }
  const id = await createCouple(
    {
      partner1_first,
      partner1_last: str(formData, "partner1Last", 80),
      partner1_email,
      partner1_phone: str(formData, "partner1Phone", 40),
      partner2_first: str(formData, "partner2First", 80),
      partner2_last: str(formData, "partner2Last", 80),
      partner2_email,
      partner2_phone: str(formData, "partner2Phone", 40),
      address: str(formData, "address", 300),
      wedding_date: dateField(formData, "weddingDate"),
      wedding_date_confirmed: formData.get("dateUnconfirmed") !== "on",
      location: str(formData, "location", 200),
      package_ids: packages.map((p) => p.id),
      meetings,
      agreed_price_cents,
      payment_plan: formData.get("payInTwo") === "on" ? "two" : "once",
    },
    admin.id,
  );
  done(`/k/${id}/gegevens`, "Portaal aangemaakt als concept. Het bruidspaar ziet nog niets totdat je het deelt.");
}

export async function updateCouple(formData: FormData) {
  const { couple } = await requireCoupleAdmin(str(formData, "coupleId", 40));
  const back = `/k/${couple.id}/gegevens`;
  const p1 = email(formData, "partner1Email");
  const p2 = email(formData, "partner2Email");
  if (!str(formData, "partner1First")) done(back, "Vul minstens de voornaam van één partner in.", true);
  if (!validEmail(p1) || !validEmail(p2)) done(back, "Controleer de e-mailadressen.", true);
  await query(
    `update couples set partner1_first = $2, partner1_last = $3, partner1_email = $4, partner1_phone = $5,
            partner2_first = $6, partner2_last = $7, partner2_email = $8, partner2_phone = $9,
            address = $10, wedding_date = $11, wedding_date_confirmed = $12, location = $13,
            suppliers_enabled = $14
      where id = $1`,
    [
      couple.id, str(formData, "partner1First", 80), str(formData, "partner1Last", 80), p1, str(formData, "partner1Phone", 40),
      str(formData, "partner2First", 80), str(formData, "partner2Last", 80), p2, str(formData, "partner2Phone", 40),
      str(formData, "address", 300), dateField(formData, "weddingDate"), formData.get("dateUnconfirmed") !== "on",
      str(formData, "location", 200), formData.get("suppliersEnabled") === "on",
    ],
  );
  done(back, "Gegevens opgeslagen.");
}

export async function uploadCover(formData: FormData) {
  const { couple, account } = await requireCoupleAdmin(str(formData, "coupleId", 40));
  const back = `/k/${couple.id}/gegevens`;
  if (formData.get("removeCover") === "on") {
    await query("update couples set cover_file_id = null where id = $1", [couple.id]);
    if (couple.cover_file_id) await deleteFiles("delete from files where id = $1 and couple_id = $2", [couple.cover_file_id, couple.id]);
    done(back, "Coverfoto verwijderd.");
  }
  try {
    const file = await storeUpload(formData.get("cover"), { coupleId: couple.id, accountId: account.id, images: true });
    if (!file) done(back, "Kies eerst een foto.", true);
    await query("update couples set cover_file_id = $2 where id = $1", [couple.id, file.id]);
    if (couple.cover_file_id) await deleteFiles("delete from files where id = $1 and couple_id = $2", [couple.cover_file_id, couple.id]);
  } catch (err) {
    if (err instanceof UploadError) done(back, err.message, true);
    throw err;
  }
  done(back, "Coverfoto opgeslagen.");
}

/** Packages can be added or removed later; the menu follows automatically. */
export async function setCouplePackages(formData: FormData) {
  const { couple, account } = await requireCoupleAdmin(str(formData, "coupleId", 40));
  const back = `/k/${couple.id}/gegevens#pakketten`;
  const wanted = formData.getAll("packageIds").map(String).filter(isUuid).slice(0, 10);
  const valid = wanted.length ? await query<{ id: string }>("select id from packages where id = any($1::uuid[])", [wanted]) : [];
  const ids = valid.map((p) => p.id);
  await tx(async (db) => {
    await query("delete from couple_packages where couple_id = $1 and not (package_id = any($2::uuid[]))", [couple.id, ids], db);
    await addPackages(couple.id, ids, account.id, db);
    await query("update couples set package_id = $2 where id = $1", [couple.id, ids[0] ?? null], db);
  });
  done(back, "Pakketten opgeslagen. Het menu van het bruidspaar past zich aan.");
}

/** Without e-mail (no Resend key or SMTP) the links are shown to Sabine once, through a short-lived cookie. */
async function showLinksOnce(links: { email: string; link: string }[]) {
  (await cookies()).set("ws_links", JSON.stringify(links), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 120,
  });
}

function inviteText(couple: Couple, link: string) {
  return `Lieve ${coupleName(couple)},\n\nWat fijn dat we samen aan jullie bruiloft gaan werken! Jullie Wedding Space staat klaar: één plek met jullie takenlijst, afspraken, leveranciers, kosten en de samenvattingen van onze gesprekken.\n\nKies via deze persoonlijke link een wachtwoord:\n${link}\n\nLiefs,\nSabine`;
}

export async function shareCouple(formData: FormData) {
  const { couple } = await requireCoupleAdmin(str(formData, "coupleId", 40));
  const back = `/k/${couple.id}/gegevens`;
  if (!couple.partner1_email && !couple.partner2_email) done(back, "Vul eerst minstens één e-mailadres in.", true);
  let invites;
  try {
    invites = await activateCouple(couple);
  } catch (err) {
    done(back, (err as Error).message, true);
  }
  const unsent: { email: string; link: string }[] = [];
  for (const invite of invites) {
    const sent = await sendMail({
      to: invite.email,
      subject: "Jullie Wedding Space staat klaar",
      text: inviteText(couple, invite.link),
      log: { kind: "uitnodiging_portaal", coupleId: couple.id, sensitive: true },
    });
    if (!sent) unsent.push(invite);
  }
  if (unsent.length) await showLinksOnce(unsent);
  done(
    back,
    invites.length === 0
      ? "Het portaal is gedeeld. Alle accounts hadden al een wachtwoord."
      : unsent.length === 0
        ? `Gedeeld. De uitnodiging is gemaild naar ${invites.map((i) => i.email).join(" en ")}.`
        : "Gedeeld, maar de e-mail kon niet worden verstuurd. Stuur de link hieronder zelf door.",
  );
}

export async function resendInvite(formData: FormData) {
  const { couple } = await requireCoupleAdmin(str(formData, "coupleId", 40));
  const back = `/k/${couple.id}/gegevens`;
  const accountId = str(formData, "accountId", 40);
  const member = accountId ? await one("select 1 from members where user_id = $1 and couple_id = $2", [accountId, couple.id]) : null;
  const user = member ? await getStore().getUser(accountId) : null;
  if (!user) done(back, "Account niet gevonden.", true);
  let link: string;
  try {
    link = await loginLink(user);
  } catch (err) {
    done(back, (err as Error).message, true);
  }
  const reset = Boolean(user.activatedAt);
  const sent = await sendMail(
    reset
      ? {
          to: user.email,
          subject: "Nieuw wachtwoord voor Your Wedding Space",
          text: `Via deze link kies je een nieuw wachtwoord:\n${link}\n\nDe link werkt één keer.`,
          log: { kind: "inloglink", coupleId: couple.id, sensitive: true },
        }
      : { to: user.email, subject: "Jullie Wedding Space staat klaar", text: inviteText(couple, link), log: { kind: "uitnodiging_portaal", coupleId: couple.id, sensitive: true } },
  );
  if (!sent) await showLinksOnce([{ email: user.email, link }]);
  done(back, sent ? `Nieuwe link gemaild naar ${user.email}.` : "Nieuwe link gemaakt; stuur hem hieronder zelf door.");
}

export async function setCoupleStatus(formData: FormData) {
  const { couple } = await requireCoupleAdmin(str(formData, "coupleId", 40));
  const status = str(formData, "status");
  if (status !== "archived" && status !== "active" && status !== "concept") done(`/k/${couple.id}/gegevens`, "Onbekende status.", true);
  await query("update couples set status = $2 where id = $1", [couple.id, status]);
  // Hiding the portal again: the couple's pages close right away (access checks the status);
  // with Supabase their sessions are also signed out everywhere.
  if (status !== "active") await endSessionsOf(couple.id);
  done(`/k/${couple.id}/gegevens`, status === "archived" ? "Gearchiveerd. Het bruidspaar kan niet meer inloggen." : status === "concept" ? "Weer verborgen voor het bruidspaar." : "Weer zichtbaar voor het bruidspaar.");
}

// Packages ----------------------------------------------------------------------------------

export async function savePackage(formData: FormData) {
  await requireOwner();
  const id = str(formData, "packageId", 40);
  const back = isUuid(id) ? `/beheer/bruidsparen/pakketten/${id}` : "/beheer/bruidsparen/pakketten";
  const name = str(formData, "name", 120);
  if (!name) done(back, "Geef het pakket een naam.", true);
  let price: number | null;
  try {
    price = parseMoney(str(formData, "price", 30));
  } catch (err) {
    done(back, (err as Error).message, true);
  }
  const meetings = Math.max(0, Math.min(20, Math.round(Number(str(formData, "meetings", 3)) || 0)));
  const kind = ["wp", "cm", "od"].includes(str(formData, "kind")) ? str(formData, "kind") : "wp";
  const values = [name, str(formData, "variant", 120), price ?? 0, meetings, formData.get("suppliersEnabled") === "on", str(formData, "description", 5000), kind];
  if (isUuid(id)) {
    await query("update packages set name = $2, variant = $3, price_cents = $4, meetings = $5, suppliers_enabled = $6, description = $7, kind = $8 where id = $1", [id, ...values]);
    done(back, "Pakket opgeslagen. Bestaande bruidsparen houden hun eigen meetings en taken.");
  }
  const row = await one<{ id: string }>(
    `insert into packages (name, variant, price_cents, meetings, suppliers_enabled, description, kind, position)
     values ($1, $2, $3, $4, $5, $6, $7, (select coalesce(max(position), 0) + 1 from packages)) returning id`,
    values,
  );
  done(`/beheer/bruidsparen/pakketten/${row!.id}`, "Pakket toegevoegd. Voeg nu de starttaken toe.");
}

export async function archivePackage(formData: FormData) {
  await requireOwner();
  const id = str(formData, "packageId", 40);
  const archived = formData.get("archived") === "1";
  if (isUuid(id)) await query("update packages set archived = $2 where id = $1", [id, archived]);
  const back = str(formData, "back", 200).startsWith("/beheer/") ? str(formData, "back", 200) : "/beheer/bruidsparen/pakketten";
  done(back, archived ? "Pakket verborgen; het is niet meer te kiezen en staat niet meer op de openingsdanspagina. Bruidsparen die het al hebben, houden het." : "Pakket weer zichtbaar.");
}

export async function addPackageTask(formData: FormData) {
  await requireOwner();
  const id = str(formData, "packageId", 40);
  const lane = str(formData, "lane") as Lane;
  const title = str(formData, "title", 200);
  const back = `/beheer/bruidsparen/pakketten/${id}#starttaken`;
  if (!isUuid(id) || !LANES.includes(lane) || !title) done(back, "Vul een taak in.", true);
  await query(
    "insert into package_tasks (package_id, lane, title, position) values ($1, $2, $3, (select coalesce(max(position), 0) + 1 from package_tasks where package_id = $1 and lane = $2))",
    [id, lane, title],
  );
  done(back, "Starttaak toegevoegd.");
}

export async function deletePackageTask(formData: FormData) {
  await requireOwner();
  const id = str(formData, "packageId", 40);
  const taskId = str(formData, "taskId", 40);
  if (isUuid(taskId)) await query("delete from package_tasks where id = $1 and package_id = $2", [taskId, id]);
  done(`/beheer/bruidsparen/pakketten/${id}#starttaken`, "Starttaak verwijderd.");
}

// Settings and supplier categories -------------------------------------------------------------

export async function saveSettings(formData: FormData) {
  await requireOwner();
  const guides = str(formData, "meetingGuides", 20_000)
    .split(/\n\s*\n/)
    .map((g) => g.trim())
    .filter(Boolean);
  await query(
    `update settings set business_name = $1, contact_name = $2, contact_email = $3, contact_phone = $4, contact_address = $5,
            kvk = $6, terms_url = $7, default_welcome = $8, meeting_guides = $9::jsonb, detail_guide = $10, evaluation_guide = $11`,
    [
      str(formData, "businessName", 120), str(formData, "contactName", 120), email(formData, "contactEmail"),
      str(formData, "contactPhone", 40), str(formData, "contactAddress", 300), str(formData, "kvk", 20),
      str(formData, "termsUrl", 500), str(formData, "defaultWelcome", 3000), JSON.stringify(guides),
      str(formData, "detailGuide", 2000), str(formData, "evaluationGuide", 2000),
    ],
  );
  done("/beheer/instellingen/portaal", "Instellingen opgeslagen.");
}

export async function saveCategory(formData: FormData) {
  await requireOwner();
  const id = str(formData, "categoryId", 40);
  const name = str(formData, "name", 80);
  const back = "/beheer/bruidsparen/standaardlijsten#categorieen";
  if (!name) done(back, "Geef de categorie een naam.", true);
  if (isUuid(id)) await query("update supplier_categories set name = $2 where id = $1", [id, name]);
  else await query("insert into supplier_categories (name, position) values ($1, (select coalesce(max(position), 0) + 1 from supplier_categories))", [name]);
  done(back, "Categorie opgeslagen.");
}

export async function archiveCategory(formData: FormData) {
  await requireOwner();
  const id = str(formData, "categoryId", 40);
  const archived = formData.get("archived") === "1";
  if (isUuid(id)) await query("update supplier_categories set archived = $2 where id = $1", [id, archived]);
  done("/beheer/bruidsparen/standaardlijsten#categorieen", archived ? "Categorie verborgen. Ingevulde gegevens blijven bewaard." : "Categorie weer zichtbaar.");
}

// Sabine's own agenda entry, straight from the central agenda -------------------------------------

export async function addAgendaItem(formData: FormData) {
  const admin = await requireOwner();
  const coupleId = str(formData, "coupleId", 40);
  const title = str(formData, "title", 200);
  const onDate = dateField(formData, "onDate");
  if (!isUuid(coupleId) || !title || !onDate) done("/beheer/bruidsparen/agenda", "Kies een bruidspaar en vul een omschrijving en datum in.", true);
  await tx(async (db) => {
    const exists = await one("select 1 from couples where id = $1", [coupleId], db);
    if (!exists) throw new Error("Bruidspaar niet gevonden.");
    await query(
      `insert into appointments (couple_id, kind, title, on_date, at_time, with_sabine, created_by) values ($1, $2, $3, $4, $5, true, $6)`,
      [coupleId, str(formData, "kind") === "deadline" ? "deadline" : "appointment", title, onDate, /^\d{2}:\d{2}$/.test(str(formData, "atTime", 5)) ? str(formData, "atTime", 5) : "", admin.id],
      db,
    );
  });
  done("/beheer/bruidsparen/agenda", `Toegevoegd op ${formatDate(onDate)}.`);
}

/** Price, payment plan, date of sale and what has been paid (feedback Sabine). */
export async function saveCouplePayment(formData: FormData) {
  const { couple } = await requireCoupleAdmin(str(formData, "coupleId", 40));
  const back = `/k/${couple.id}/gegevens#betaling`;
  let price: number | null = null;
  try {
    price = parseMoney(str(formData, "agreedPrice", 20));
  } catch {
    done(back, "Vul de afgesproken prijs in als bedrag, bijvoorbeeld 2.450 of 2450,00.", true);
  }
  const plan = formData.get("payInTwo") === "on" ? "two" : "once";
  const soldOn = dateField(formData, "soldOn") ?? couple.sold_on;
  // Keep the moment a part was ticked; a new tick gets "now", an untick clears it.
  const stamp = (field: string, before: Date | null) => (formData.get(field) === "on" ? before ?? new Date() : null);
  const first = stamp("paidFirst", couple.paid_first_at);
  const second = plan === "two" ? stamp("paidSecond", couple.paid_second_at) : null;
  await query(
    "update couples set agreed_price_cents = $2, payment_plan = $3, sold_on = $4, paid_first_at = $5, paid_second_at = $6 where id = $1",
    [couple.id, price, plan, soldOn, first, second],
  );
  done(back, "Prijs en betaling opgeslagen.");
}
