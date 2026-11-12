// Runs the SQL files in supabase/migrations that have not run yet, in name
// order. Render runs this as the pre-deploy command, so the database is up to
// date before the new version goes live. A failed migration stops the deploy
// and the old version keeps running.
//
//   DATABASE_URL=postgresql://... node scripts/migrate.mjs   (or: npm run db:migrate, reads .env.local)
//
// DATABASE_URL is the Supabase "Session pooler" connection string (Connect
// button in Supabase). Optional: DATABASE_CA_CERT with the contents of the
// Supabase CA certificate (Project Settings, Database, SSL) to verify the
// server certificate.

import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import pg from "pg";

for (const file of [".env.local", ".env"]) if (!process.env.DATABASE_URL && existsSync(file)) process.loadEnvFile(file);

const dir = path.resolve("supabase/migrations");
const url = process.env.DATABASE_URL;

if (!url) {
  // The whole app (Academy and Your Wedding Space) lives in this database, so it is always needed.
  console.error(
    "[migraties] DATABASE_URL ontbreekt. In de hosting: de Session pooler connection string van Supabase. Lokaal: je eigen Postgres (zie README).",
  );
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

// The only migrations the first version of this script recorded by itself.
const BOOTSTRAP = ["0001_init.sql", "0002_supabase_auth.sql"];

// The tables and columns a migration creates (create table, alter table ... add column).
// Every migration has at least one, and none is ever created by two migrations.
function createdObjects(sql) {
  const text = sql.replace(/--[^\n]*/g, "");
  const schema = /set\s+local\s+search_path\s+to\s+wedding_space/i.test(text) ? "wedding_space" : "public";
  const qualify = (n) => {
    const name = n.toLowerCase().replace(/"/g, "");
    return name.includes(".") ? name.split(".") : [schema, name];
  };
  const tables = [];
  const columns = [];
  let table = null;
  const re =
    /\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?([\w."]+)|\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w."]+)|\badd\s+column\s+(?:if\s+not\s+exists\s+)?([\w"]+)|;/gi;
  for (const m of text.matchAll(re)) {
    if (m[1]) tables.push(qualify(m[1]));
    else if (m[2]) table = qualify(m[2]);
    else if (m[3] && table) columns.push([...table, m[3].toLowerCase().replace(/"/g, "")]);
    else table = null;
  }
  return { tables, columns };
}

// A migration counts as run by hand when something it creates is already there. Any one
// object is enough: a migration that never ran has none of its own. Rerunning instead is
// not safe, many migrations also move or seed data.
async function alreadyApplied(sql) {
  const { tables, columns } = createdObjects(sql);
  for (const [s, t] of tables) {
    const { rows } = await client.query(
      "select 1 from information_schema.tables where table_schema = $1 and table_name = $2",
      [s, t],
    );
    if (rows.length) return true;
  }
  for (const [s, t, c] of columns) {
    const { rows } = await client.query(
      "select 1 from information_schema.columns where table_schema = $1 and table_name = $2 and column_name = $3",
      [s, t, c],
    );
    if (rows.length) return true;
  }
  return false;
}

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
  // Migrations that were run by hand in the SQL editor before this script kept track. Older
  // versions of this script only recognised 0001 and 0002, so a history holding nothing else
  // still counts as untracked. Only then: once the history is real, a migration always runs.
  if (rows.every((r) => BOOTSTRAP.includes(r.name))) {
    const recorded = new Set(rows.map((r) => r.name));
    for (const name of files.filter((f) => !recorded.has(f))) {
      if (!(await alreadyApplied(readFileSync(path.join(dir, name), "utf8")))) continue;
      await client.query("insert into public.schema_migrations (name) values ($1) on conflict do nothing", [name]);
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
