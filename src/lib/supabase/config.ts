/** Supabase settings from the environment. Read lazily so builds need no secrets. */

/**
 * Supabase Auth and Storage are used whenever SUPABASE_URL is set, which is
 * always the case in production. Without it (local development) the app uses
 * the development login (src/lib/auth/dev-auth.ts) and keeps uploads in
 * Postgres. The data itself always goes through DATABASE_URL.
 */
export const supabaseEnabled = (env: NodeJS.ProcessEnv = process.env) => Boolean(env.SUPABASE_URL?.trim());

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} ontbreekt. Zie .env.example en de README (Supabase).`);
  return value;
}

/**
 * The project URL, e.g. https://abcdefghijklmnop.supabase.co. Forgives the
 * usual copy-paste slips (spaces, quotes, a trailing slash, /rest/v1) and
 * explains what is wrong otherwise.
 */
export function normaliseSupabaseUrl(raw: string | undefined): { url: string } | { error: string } {
  const value = (raw ?? "").trim().replace(/^["']|["']$/g, "").trim();
  if (!value) return { error: "SUPABASE_URL ontbreekt." };
  if (/^postgres(ql)?:\/\//i.test(value)) {
    return { error: "SUPABASE_URL bevat een database connection string. Dat hoort in DATABASE_URL; SUPABASE_URL is https://<project-ref>.supabase.co (Project Settings, Data API)." };
  }
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    return { url: `${url.protocol}//${url.host}` };
  } catch {
    return { error: `SUPABASE_URL "${value.slice(0, 60)}" is geen geldige URL. Verwacht: https://<project-ref>.supabase.co` };
  }
}

export function supabaseUrl(): string {
  const result = normaliseSupabaseUrl(process.env.SUPABASE_URL);
  if ("error" in result) throw new Error(result.error);
  return result.url;
}

/** Publishable (anon) key: used for sign in, sessions and password reset. */
export const supabaseAnonKey = () => required("SUPABASE_ANON_KEY").trim().replace(/^["']|["']$/g, "");

/** Secret (service role) key: server only, never sent to the browser. */
export const supabaseServiceKey = () => required("SUPABASE_SERVICE_ROLE_KEY").trim().replace(/^["']|["']$/g, "");

export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** Private Storage bucket that holds every upload. */
export const BUCKET = "academy";
