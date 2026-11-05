// Demo data for local development only: an admin account and one shared couple.
// Refuses to run against anything but a local database.
//
//   DATABASE_URL=postgresql://postgres@localhost:5432/wedding_space npm run db:seed

import { randomBytes, scryptSync } from "crypto";
import pg from "pg";
import { connectionOptions } from "./migrate-options.mjs";

const url = process.env.DATABASE_URL ?? "";
const host = url ? new URL(url).hostname : "";
if (!["localhost", "127.0.0.1"].includes(host)) {
  console.error("De demodata is alleen voor een lokale database (localhost).");
  process.exit(1);
}
const PASSWORD = "wedding-demo";
const hash = (pw) => {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
};

const db = new pg.Client(connectionOptions(url));
await db.connect();
try {
  await db.query("begin");
  await db.query("insert into accounts (email, name, role, password_hash) values ('sabine@estasiweddings.nl', 'Sabine Tillema', 'admin', $1) on conflict (email) do nothing", [hash(PASSWORD)]);
  const exists = await db.query("select 1 from accounts where email = 'carlijn@voorbeeld.nl'");
  if (exists.rowCount === 0) {
    const pkg = (await db.query("select id, meetings from packages where name = 'Ceremoniemeester' and variant = '' limit 1")).rows[0];
    const settings = (await db.query("select default_welcome, meeting_guides, detail_guide from settings")).rows[0];
    const date = new Date(Date.now() + 214 * 86_400_000).toISOString().slice(0, 10);
    const couple = (await db.query(
      `insert into couples (partner1_first, partner1_last, partner1_email, partner2_first, partner2_last, partner2_email, wedding_date, location, package_id, welcome_text, status, activated_at)
       values ('Carlijn', 'de Boer', 'carlijn@voorbeeld.nl', 'Thom', 'Visser', 'thom@voorbeeld.nl', $1, 'Landgoed Lemferdinge', $2, $3, 'active', now()) returning id`,
      [date, pkg.id, settings.default_welcome],
    )).rows[0];
    for (const [email, name] of [["carlijn@voorbeeld.nl", "Carlijn de Boer"], ["thom@voorbeeld.nl", "Thom Visser"]]) {
      await db.query("insert into accounts (email, name, role, couple_id, password_hash) values ($1, $2, 'couple', $3, $4)", [email, name, couple.id, hash(PASSWORD)]);
    }
    await db.query("insert into tasks (couple_id, lane, title, position) select $1, lane, title, position from package_tasks where package_id = $2", [couple.id, pkg.id]);
    await db.query("update tasks set deadline = current_date + 14 where couple_id = $1 and title = 'Eerste meeting inplannen'", [couple.id]);
    for (let n = 1; n <= pkg.meetings; n++) {
      await db.query("insert into meetings (couple_id, kind, title, guide, status, position, summary, planned_on) values ($1, 'meeting', $2, $3, $4, $5, $6, $7)", [
        couple.id, `Meeting ${n}`, settings.meeting_guides[n - 1] ?? "", n === 1 ? "done" : n === 2 ? "planned" : "to_plan", n,
        n === 1 ? "Fijne kennismaking! We hebben de dagindeling op hoofdlijnen gemaakt: ceremonie om 14:00, diner om 18:00. Nog te regelen: catering en fotograaf." : "",
        n === 2 ? new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10) : null,
      ]);
    }
    await db.query("insert into meetings (couple_id, kind, title, guide, status, position) values ($1, 'detail', 'Detailbespreking', $2, 'to_plan', $3)", [couple.id, settings.detail_guide, pkg.meetings + 1]);
    await db.query("insert into appointments (couple_id, kind, title, on_date, at_time, with_sabine) values ($1, 'appointment', 'Meeting 2 met Sabine', current_date + 20, '19:30', true), ($1, 'deadline', 'Definitief aantal gasten doorgeven', current_date + 45, '', false)", [couple.id]);
    await db.query("insert into questions (couple_id, body, asked_by) select $1, 'Moeten wij zelf de ceremoniespreker regelen, of doe jij dat?', id from accounts where email = 'carlijn@voorbeeld.nl'", [couple.id]);
    const loc = (await db.query("select id from supplier_categories where name = 'Locatie'")).rows[0];
    await db.query("insert into couple_suppliers (couple_id, category_id, status, name, contact_person, email) values ($1, $2, 'booked', 'Landgoed Lemferdinge', 'Marieke', 'events@lemferdinge.nl')", [couple.id, loc.id]);
    await db.query("insert into budget_items (couple_id, name, category, budget_cents, actual_cents, deposit_cents, paid, position) values ($1, 'Locatie', 'Locatie', 240000, 240000, null, true, 1), ($1, 'Catering', 'Catering', 320000, null, 50000, false, 2)", [couple.id]);
  }
  await db.query("commit");
  console.log(`Demodata klaar. Inloggen met wachtwoord "${PASSWORD}":\n  sabine@estasiweddings.nl (beheer)\n  carlijn@voorbeeld.nl en thom@voorbeeld.nl (bruidspaar)`);
} catch (err) {
  await db.query("rollback");
  console.error(`Fout: ${err.message}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
