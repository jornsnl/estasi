// Creates Sabine's admin account (or a new link for an existing one) and
// prints a one-time link to choose the password. No password on the command line.
//
//   DATABASE_URL=... APP_URL=https://... node scripts/create-admin.mjs --email sabine@estasiweddings.nl --naam "Sabine Tillema"

import { createHash, randomBytes } from "crypto";
import pg from "pg";
import { connectionOptions } from "./migrate-options.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const email = arg("email")?.trim().toLowerCase();
const name = arg("naam");
if (!process.env.DATABASE_URL || !email || !name) {
  console.error('Gebruik: DATABASE_URL=... APP_URL=... node scripts/create-admin.mjs --email naam@domein.nl --naam "Naam"');
  process.exit(1);
}

const client = new pg.Client(connectionOptions(process.env.DATABASE_URL));
await client.connect();
try {
  const { rows } = await client.query(
    `insert into accounts (email, name, role) values ($1, $2, 'admin')
     on conflict (email) do update set name = excluded.name returning id, role`,
    [email, name],
  );
  if (rows[0].role !== "admin") throw new Error(`${email} is al een account van een bruidspaar.`);
  const token = randomBytes(32).toString("base64url");
  await client.query("update account_tokens set used_at = now() where account_id = $1 and used_at is null", [rows[0].id]);
  await client.query(
    "insert into account_tokens (token_hash, account_id, purpose, expires_at) values ($1, $2, 'invite', now() + interval '7 days')",
    [createHash("sha256").update(token).digest("hex"), rows[0].id],
  );
  const base = (process.env.APP_URL ?? "http://localhost:3001").replace(/\/+$/, "");
  console.log(`\nBeheeraccount klaar voor ${email}. Kies het wachtwoord via deze link (7 dagen geldig, één keer te gebruiken):\n\n${base}/activeren/${token}\n`);
} catch (err) {
  console.error(`Fout: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
