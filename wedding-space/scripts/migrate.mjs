// Runs the SQL files in db/migrations that have not run yet, in name order,
// each in one transaction. Render runs this as the pre-deploy command: a
// failed migration stops the deploy and the old version keeps running.
//
//   DATABASE_URL=postgresql://... node scripts/migrate.mjs

import { readdirSync, readFileSync } from "fs";
import path from "path";
import pg from "pg";
import { connectionOptions } from "./migrate-options.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migraties] DATABASE_URL ontbreekt.");
  process.exit(1);
}

const dir = path.resolve("db/migrations");
const files = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
const client = new pg.Client(connectionOptions(url));
const LOCK = 727275;

try {
  await client.connect();
  await client.query("select pg_advisory_lock($1)", [LOCK]);
  await client.query(`create table if not exists schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  await client.query("alter table schema_migrations enable row level security");
  const { rows } = await client.query("select name from schema_migrations");
  const done = new Set(rows.map((r) => r.name));
  const pending = files.filter((f) => !done.has(f));
  if (pending.length === 0) console.log("[migraties] Database is bij, niets uit te voeren.");
  for (const name of pending) {
    console.log(`[migraties] ${name} uitvoeren...`);
    try {
      await client.query("begin");
      await client.query(readFileSync(path.join(dir, name), "utf8"));
      await client.query("insert into schema_migrations (name) values ($1)", [name]);
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
