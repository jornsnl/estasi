import "server-only";
import { isSupabaseMode } from "@/lib/data";
import { adminClient } from "@/lib/supabase/server";
import { query } from "./db";

/** Signs every account of a couple out (Supabase); access is closed by the couple status anyway. */
export async function endSessionsOf(coupleId: string) {
  if (!isSupabaseMode()) return;
  const members = await query<{ user_id: string }>("select user_id from members where couple_id = $1", [coupleId]);
  for (const m of members) {
    await adminClient().auth.admin.signOut(m.user_id, "global").catch(() => undefined);
  }
}
