/** Supabase settings from the environment. Read lazily so builds need no secrets. */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} ontbreekt. Zie .env.example en de README (Supabase).`);
  return value;
}

export const supabaseUrl = () => required("SUPABASE_URL");

/** Publishable (anon) key: used for sign in, sessions and password reset. */
export const supabaseAnonKey = () => required("SUPABASE_ANON_KEY");

/** Secret (service role) key: server only, never sent to the browser. */
export const supabaseServiceKey = () => required("SUPABASE_SERVICE_ROLE_KEY");

export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** Private Storage bucket that holds every upload. */
export const BUCKET = "academy";
