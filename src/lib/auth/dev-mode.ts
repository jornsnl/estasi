import { supabaseEnabled } from "@/lib/supabase/config";

/**
 * The development login: e-mail plus a password from public.dev_passwords,
 * with a signed cookie as session. Only for local development and tests:
 * allowed when SUPABASE_URL is missing AND NODE_ENV is not "production".
 * Everywhere else every dev-auth function refuses (assertDevAuth).
 */
export const devAuthAllowed = (env: NodeJS.ProcessEnv = process.env) =>
  !supabaseEnabled(env) && env.NODE_ENV !== "production";

export class DevAuthRefused extends Error {
  constructor() {
    super("De ontwikkel-login is alleen beschikbaar zonder SUPABASE_URL en buiten productie.");
  }
}

export function assertDevAuth(env: NodeJS.ProcessEnv = process.env) {
  if (!devAuthAllowed(env)) throw new DevAuthRefused();
}
