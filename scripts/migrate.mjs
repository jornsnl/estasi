// Runs the SQL files in supabase/migrations that have not run yet, in name
// order. Render runs this as the pre-deploy command, so the database is up to
// date before the new version goes live. A failed migration stops the deploy
// and the old version keeps running.
//
//   DATABASE_URL=postgresql://... node scripts/migrate.mjs
//
// DATABASE_URL is the Supabase "Session pooler" connection string (Connect
// button in Supabase). Optional: DATABASE_CA_CERT with the contents of the
// Supabase CA certificate (Project Settings, Database, SSL) to verify the
// server certificate.

import { readdirSync, readFileSync } from "fs";
import path from "path";
import pg from "pg";

const dir = path.resolve("supabase/migrations");
const url = process.env.DATABASE_URL;

if (!url) {
  if (process.env.DATA_BACKEND !== "supabase") {
    console.log("[migraties] DATA_BACKEND is niet supabase, niets te doen.");
    process.exit(0);
  }
  console.error("[migraties] DATABASE_URL ontbreekt. Zet de Session pooler connection string van Supabase in de hosting.");
  process.exit(1);
}

const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
// Drop sslmode from the URL: the ssl option below decides how the certificate is checked.
const connectionString = url.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
const host = new URL(connectionString).hostname;
const local = host === "localhost" || host === "127.0.0.1";
const client = new pg.Client({
  connectionString,
  // A local database (development) has no TLS; anything remote does.
  ssl: local ? false : ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
  application_name: "academy-migrate",
});

const files = readdirSync(dir)
  .filter((f) => /^\d+_.+\.sql$/.test(f))
  .sort();

// Same lock for every deploy, so two deploys never migrate at the same time.
const LOCK = 727274;

try {
  await client.connect();
  await client.query("select pg_advisory_lock($1)", [LOCK]);
  await client.query(`
    create table if not exists public.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
    alter table public.schema_migrations enable row level security;
    revoke all on public.schema_migrations from anon, authenticated;
  `);

  let { rows } = await client.query("select name from public.schema_migrations");
  if (rows.length === 0) {
    // Migrations that were run by hand in the SQL editor before this script existed.
    const { rows: [state] } = await client.query(`
      select to_regclass('public.users') is not null as has_init,
             exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'users' and column_name = 'activated_at') as has_auth
    `);
    const done = [];
    if (state.has_init) done.push("0001_init.sql");
    if (state.has_auth) done.push("0002_supabase_auth.sql");
    for (const name of done.filter((n) => files.includes(n))) {
      await client.query("insert into public.schema_migrations (name) values ($1)", [name]);
      console.log(`[migraties] ${name} was al eerder uitgevoerd, vastgelegd`);
    }
    ({ rows } = await client.query("select name from public.schema_migrations"));
  }

  const applied = new Set(rows.map((r) => r.name));
  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) console.log("[migraties] Database is bij, niets uit te voeren.");

  for (const name of pending) {
    const sql = readFileSync(path.join(dir, name), "utf8");
    console.log(`[migraties] ${name} uitvoeren...`);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into public.schema_migrations (name) values ($1)", [name]);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      throw new Error(`${name} mislukt, niets van deze migratie is bewaard: ${err.message}`);
    }
    console.log(`[migraties] ${name} klaar`);
  }
} catch (err) {
  console.error(`[migraties] ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
