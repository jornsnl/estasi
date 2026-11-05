// One-time setup of a Supabase project for the Academy, after the migrations.
//
//   npm run supabase:setup -- --eigenaar sabine@estasiweddings.nl --naam "Sabine"
//   npm run supabase:setup -- --eigenaar ... --naam ... --voorbeeldinhoud
//
// Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and APP_URL (from the shell,
// .env.local or .env). It:
// 1. checks that the migrations ran (tables and the "academy" bucket exist)
// 2. fills empty settings (welcome text, contact address, privacy notice)
// 3. creates the owner account and mails the invitation, or turns an existing
//    account into the owner
// 4. with --voorbeeldinhoud: loads the six example modules, only into an empty course
// Running it again is safe: nothing that exists is overwritten.

import { existsSync } from "fs";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createSeed } from "../src/lib/data/seed";
import { toRow } from "../src/lib/data/supabase-rows";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function fail(message: string): never {
  console.error(`\nFout: ${message}\n`);
  process.exit(1);
}

const url = process.env.SUPABASE_URL ?? fail("SUPABASE_URL ontbreekt.");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? fail("SUPABASE_SERVICE_ROLE_KEY ontbreekt.");
const appUrl = (process.env.APP_URL ?? fail("APP_URL ontbreekt (de publieke adres van de app).")).replace(/\/+$/, "");
const ownerEmail = (arg("eigenaar") ?? fail("Geef het e-mailadres van de eigenaar mee: --eigenaar naam@domein.nl")).trim().toLowerCase();
const ownerName = arg("naam") ?? fail('Geef de naam van de eigenaar mee: --naam "Sabine"');
const withContent = process.argv.includes("--voorbeeldinhoud");

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const seed = createSeed();

async function must<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await query;
  if (error) fail(`${what}: ${error.message}`);
  return data;
}

// 1. Migrations ---------------------------------------------------------------

const settingsRow = await must(db.from("settings").select().eq("id", true).maybeSingle(), "Tabel settings (zijn 0001 en 0002 uitgevoerd?)");
if (!settingsRow) fail("De tabel settings is leeg. Voer supabase/migrations/0001_init.sql opnieuw uit.");
await must(db.from("users").select("activated_at").limit(1), "Kolom users.activated_at (is 0002 uitgevoerd?)");
const bucket = await db.storage.getBucket("academy");
if (bucket.error) fail(`Storage bucket "academy" niet gevonden (is 0002 uitgevoerd?): ${bucket.error.message}`);
console.log("✓ Migraties en bucket aanwezig");

// 2. Settings -----------------------------------------------------------------

const settingsPatch: Record<string, unknown> = {};
const defaults = toRow("settings", seed.settings);
for (const [column, value] of Object.entries(defaults)) {
  if (column === "welcome_video_url" || column === "practical_spots_available") continue;
  if (settingsRow[column] === "" && value) settingsPatch[column] = value;
}
if (Object.keys(settingsPatch).length) {
  await must(db.from("settings").update(settingsPatch).eq("id", true), "Instellingen bijwerken");
  console.log(`✓ Instellingen aangevuld: ${Object.keys(settingsPatch).join(", ")}`);
} else {
  console.log("✓ Instellingen waren al ingevuld");
}

// 3. Owner --------------------------------------------------------------------

async function findAuthUser(email: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`Supabase Auth: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found || data.users.length < 200) return found ?? null;
  }
}

let authUser = await findAuthUser(ownerEmail);
if (!authUser) {
  const { data, error } = await db.auth.admin.inviteUserByEmail(ownerEmail, {
    data: { name: ownerName },
    redirectTo: `${appUrl}/auth/bevestigen`,
  });
  if (error || !data.user) fail(`Uitnodiging versturen mislukt: ${error?.message}. Staat SMTP goed in Supabase?`);
  authUser = data.user;
  console.log(`✓ Uitnodiging gemaild naar ${ownerEmail}`);
} else if (!authUser.last_sign_in_at) {
  // Invited before but never used: send a fresh invitation (the old link may have expired).
  const { error } = await db.auth.admin.inviteUserByEmail(ownerEmail, { redirectTo: `${appUrl}/auth/bevestigen` });
  console.log(error ? `• Opnieuw uitnodigen lukte niet (${error.message}); gebruik Wachtwoord vergeten` : `✓ Nieuwe uitnodiging gemaild naar ${ownerEmail}`);
} else {
  console.log(`✓ Supabase account bestond al voor ${ownerEmail}`);
}

const existing = await must(db.from("users").select().eq("id", authUser.id).maybeSingle(), "Tabel users");
if (existing) {
  if (existing.role !== "owner") await must(db.from("users").update({ role: "owner" }).eq("id", authUser.id), "Rol bijwerken");
  console.log(`✓ ${ownerEmail} is eigenaar`);
} else {
  const now = new Date().toISOString();
  await must(
    db.from("users").insert({
      id: authUser.id,
      email: ownerEmail,
      name: ownerName,
      role: "owner",
      created_at: now,
      activated_at: authUser.last_sign_in_at ? now : null,
    }),
    "Eigenaar aanmaken",
  );
  await must(db.from("profiles").upsert({ user_id: authUser.id }, { onConflict: "user_id" }), "Profiel aanmaken");
  console.log(`✓ ${ownerEmail} aangemaakt als eigenaar`);
}

// 4. Example content ------------------------------------------------------------

if (withContent) {
  const { count } = await db.from("modules").select("id", { count: "exact", head: true });
  if (count) {
    console.log(`• Voorbeeldinhoud overgeslagen: er staan al ${count} modules`);
  } else {
    // The seed uses readable ids (mod-1, les-1-1); the database wants uuids.
    const ids = new Map<string, string>();
    const idFor = (old: string) => ids.get(old) ?? ids.set(old, randomUUID()).get(old)!;
    const modules = seed.modules.map((m) => toRow("modules", { ...m, id: idFor(m.id) }));
    const lessons = seed.lessons.map((l) => toRow("lessons", { ...l, id: idFor(l.id), moduleId: idFor(l.moduleId) }));
    await must(db.from("modules").insert(modules), "Modules invoegen");
    await must(db.from("lessons").insert(lessons), "Lessen invoegen");
    await must(db.from("settings").update({ welcome_video_url: seed.settings.welcomeVideoUrl }).eq("id", true).eq("welcome_video_url", ""), "Welkomstvideo");
    console.log(`✓ Voorbeeldinhoud geladen: ${modules.length} modules, ${lessons.length} lessen`);
  }
}

console.log(`\nKlaar. ${ownerEmail} krijgt een e-mail om een wachtwoord te kiezen en koppelt daarna een authenticator app.\n`);
