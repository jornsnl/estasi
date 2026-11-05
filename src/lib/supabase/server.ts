import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseServiceKey, supabaseUrl } from "./config";

/**
 * Client bound to the visitor's session cookies. Only used for Supabase Auth
 * (sign in, sign out, MFA, password); app data goes through adminClient().
 */
export async function authClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Components cannot set cookies; the middleware refreshes the session instead.
        }
      },
    },
  });
}

const state = globalThis as unknown as { __academyAdmin?: SupabaseClient };

/**
 * Server only client with the secret key. It bypasses row level security, so
 * every caller must check the role first (all server actions do).
 */
export function adminClient(): SupabaseClient {
  state.__academyAdmin ??= createClient(supabaseUrl(), supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return state.__academyAdmin;
}
