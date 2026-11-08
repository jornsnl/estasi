// Demo accounts and example course for LOCAL DEVELOPMENT, in the database of
// DATABASE_URL (after the migrations).
//
//   npm run db:seed              adds what is missing (safe to run again)
//   npm run db:seed -- --reset   removes the demo accounts and demo modules first
//
// Accounts (password "academy-demo", development login):
//   sabine@estasiweddings.nl  opleider (owner)
//   lotte@voorbeeld.nl        cursist, bezig
//   noor@voorbeeld.nl         cursist, wacht op bevestiging
//   eva@voorbeeld.nl          cursist, toegang verlopen
//
// Refuses to run with SUPABASE_URL set, with NODE_ENV=production, or against a
// database that is not on this machine (set SEED_ALLOW_REMOTE=1 for a remote
// development database). Production uses scripts/supabase-setup.ts instead.

import { createHash } from "crypto";
import { existsSync } from "fs";
import pg from "pg";
import { hashPassword } from "../src/lib/auth/password";
import { createSeed, DEMO_PASSWORD } from "../src/lib/data/seed";
import { toParams, toRow, type Table } from "../src/lib/data/rows";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

function fail(message: string): never {
  console.error(`\n[seed] ${message}\n`);
  process.exit(1);
}

const url = process.env.DATABASE_URL ?? fail("DATABASE_URL ontbreekt. Zie README, Lokaal draaien.");
if (process.env.SUPABASE_URL?.trim()) fail("SUPABASE_URL is gezet: de demodata is alleen voor lokale ontwikkeling zonder Supabase.");
if (process.env.NODE_ENV === "production") fail("NODE_ENV is production: de demodata is alleen voor lokale ontwikkeling.");
const host = new URL(url).hostname;
const local = ["localhost", "127.0.0.1", "::1", "[::1]", ""].includes(host);
if (!local && process.env.SEED_ALLOW_REMOTE !== "1") {
  fail(`DATABASE_URL wijst naar ${host}, niet naar deze computer. Zet SEED_ALLOW_REMOTE=1 als dit echt een ontwikkeldatabase is.`);
}
const reset = process.argv.includes("--reset");

/** Stable uuid for a readable seed id, so running the seed again finds the same rows. */
function uuidFor(id: string): string {
  const h = createHash("sha256").update(`estasi-seed:${id}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const seed = createSeed();
const ids = {
  users: seed.users.map((u) => uuidFor(u.id)),
  modules: seed.modules.map((m) => uuidFor(m.id)),
};

const client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, application_name: "academy-seed" });

async function insert(table: Table, value: object, conflict = "do nothing") {
  const row = toRow(table, value);
  const columns = Object.keys(row);
  const result = await client.query(
    `insert into public.${table} (${columns.map((c) => `"${c}"`).join(", ")})
     values (${columns.map((_, i) => `$${i + 1}`).join(", ")}) on conflict ${conflict}`,
    toParams(table, row),
  );
  return result.rowCount ?? 0;
}

try {
  await client.connect();
  const { rows: [state] } = await client.query("select to_regclass('public.dev_passwords') is not null as ok");
  if (!state.ok) fail("Tabel public.dev_passwords bestaat niet. Voer eerst de migraties uit: npm run db:migrate");

  await client.query("begin");

  if (reset) {
    const emails = seed.users.map((u) => u.email);
    const { rows } = await client.query<{ id: string }>("select id from public.users where id = any($1) or email = any($2)", [ids.users, emails]);
    const userIds = rows.map((r) => r.id);
    // Rows that point at these accounts without "on delete cascade".
    await client.query("delete from public.feedback where author_id = any($1)", [userIds]);
    await client.query("delete from public.assignment_feedback where author_id = any($1)", [userIds]);
    await client.query("delete from public.module_unlocks where unlocked_by = any($1)", [userIds]);
    await client.query("delete from public.audit_log where actor_id = any($1)", [userIds]);
    await client.query("delete from public.files where uploaded_by = any($1)", [userIds]);
    await client.query("delete from auth.users where id = any($1)", [userIds]);
    await client.query("delete from public.users where id = any($1)", [userIds]);
    await client.query("delete from public.modules where id = any($1)", [ids.modules]);
    console.log(`[seed] Demo-accounts (${userIds.length}) en demomodules verwijderd`);
  }

  let users = 0;
  for (const user of seed.users) {
    const id = uuidFor(user.id);
    const taken = await client.query("select 1 from public.users where email = $1 and id <> $2", [user.email, id]);
    if (taken.rowCount) {
      console.log(`[seed] ${user.email} bestaat al met een ander id, overgeslagen (gebruik --reset)`);
      continue;
    }
    await client.query("insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing", [id, user.email]);
    users += await insert("users", { ...user, id });
    // The demo password always works after seeding.
    await client.query(
      `insert into public.dev_passwords (user_id, password_hash) values ($1, $2)
       on conflict (user_id) do update set password_hash = excluded.password_hash, updated_at = now()`,
      [id, hashPassword(DEMO_PASSWORD)],
    );
  }

  for (const p of seed.profiles) await insert("profiles", { ...p, userId: uuidFor(p.userId) });
  for (const e of seed.enrollments) await insert("enrollments", { ...e, id: uuidFor(e.id), userId: uuidFor(e.userId) });
  let modules = 0;
  for (const m of seed.modules) modules += await insert("modules", { ...m, id: uuidFor(m.id) });
  for (const l of seed.lessons) await insert("lessons", { ...l, id: uuidFor(l.id), moduleId: uuidFor(l.moduleId) });
  // Assignment work: a submission per assignment, a version for what was handed in.
  for (const sub of seed.submissions) {
    await insert("assignment_submissions", { ...sub, id: uuidFor(sub.id), userId: uuidFor(sub.userId), lessonId: uuidFor(sub.lessonId) });
  }
  for (const v of seed.versions) {
    await insert("submission_versions", { ...v, id: uuidFor(v.id), submissionId: uuidFor(v.submissionId), userId: uuidFor(v.userId) });
  }
  for (const c of seed.completions) {
    await insert("lesson_completions", { ...c, userId: uuidFor(c.userId), lessonId: uuidFor(c.lessonId) });
  }

  // Settings: only fill what is still empty.
  const { rows: [settings] } = await client.query("select * from public.settings where id = true");
  const defaults = toRow("settings", seed.settings);
  const patch = Object.entries(defaults).filter(([column, value]) => settings && settings[column] === "" && value);
  for (const [column, value] of patch) await client.query(`update public.settings set "${column}" = $1 where id = true`, [value]);

  await client.query("commit");
  console.log(`[seed] Klaar: ${users} nieuwe accounts, ${modules} nieuwe modules${patch.length ? `, instellingen aangevuld` : ""}.`);
  console.log(`[seed] Inloggen: sabine@estasiweddings.nl (opleider), lotte@ / noor@ / eva@voorbeeld.nl (cursisten), wachtwoord ${DEMO_PASSWORD}`);
} catch (err) {
  await client.query("rollback").catch(() => undefined);
  console.error(`[seed] Mislukt, niets bewaard: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
