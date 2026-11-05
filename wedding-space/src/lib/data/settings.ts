import "server-only";
import { one } from "@/lib/db";
import type { Settings } from "@/lib/types";

export async function getSettings(): Promise<Settings> {
  const settings = await one<Settings>("select * from settings where id = true");
  if (!settings) throw new Error("De tabel settings is leeg. Voer de migraties uit.");
  return settings;
}
