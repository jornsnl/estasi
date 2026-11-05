import { describe, expect, it } from "vitest";
import { normaliseSupabaseUrl } from "@/lib/supabase/config";

describe("SUPABASE_URL", () => {
  it("vergeeft de gebruikelijke plakfouten", () => {
    expect(normaliseSupabaseUrl(" https://abc.supabase.co/ ")).toEqual({ url: "https://abc.supabase.co" });
    expect(normaliseSupabaseUrl('"https://abc.supabase.co/rest/v1/"')).toEqual({ url: "https://abc.supabase.co" });
    expect(normaliseSupabaseUrl("abc.supabase.co")).toEqual({ url: "https://abc.supabase.co" });
  });
  it("legt uit wat er mis is", () => {
    expect(normaliseSupabaseUrl("")).toEqual({ error: "SUPABASE_URL ontbreekt." });
    const db = normaliseSupabaseUrl("postgresql://postgres.abc:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres");
    expect("error" in db && db.error).toMatch(/DATABASE_URL/);
    expect("error" in normaliseSupabaseUrl("https://")).toBe(true);
  });
});
