import { afterEach, describe, expect, it, vi } from "vitest";
import { assertDevAuth, devAuthAllowed, DevAuthRefused } from "@/lib/auth/dev-mode";
import { supabaseEnabled } from "@/lib/supabase/config";

const env = (values: Record<string, string | undefined>) => values as NodeJS.ProcessEnv;
const SOME_ID = "3f2b8c4e-1d2a-4b6c-9e8f-0a1b2c3d4e5f";

describe("development login", () => {
  it("is only allowed without SUPABASE_URL and outside production", () => {
    expect(devAuthAllowed(env({ NODE_ENV: "development" }))).toBe(true);
    expect(devAuthAllowed(env({ NODE_ENV: "test" }))).toBe(true);
    expect(devAuthAllowed(env({}))).toBe(true);
    expect(devAuthAllowed(env({ NODE_ENV: "production" }))).toBe(false);
    expect(devAuthAllowed(env({ NODE_ENV: "development", SUPABASE_URL: "https://abc.supabase.co" }))).toBe(false);
    expect(devAuthAllowed(env({ NODE_ENV: "production", SUPABASE_URL: "https://abc.supabase.co" }))).toBe(false);
  });

  it("ignores DATA_BACKEND, also when the hosting still has it", () => {
    expect(devAuthAllowed(env({ NODE_ENV: "production", DATA_BACKEND: "local" }))).toBe(false);
    expect(devAuthAllowed(env({ NODE_ENV: "development", DATA_BACKEND: "supabase" }))).toBe(true);
    expect(supabaseEnabled(env({ DATA_BACKEND: "supabase" }))).toBe(false);
    expect(supabaseEnabled(env({ DATA_BACKEND: "local", SUPABASE_URL: "https://abc.supabase.co" }))).toBe(true);
  });

  it("treats an empty SUPABASE_URL as missing", () => {
    expect(supabaseEnabled(env({ SUPABASE_URL: "  " }))).toBe(false);
  });

  it("refuses hard in production and with Supabase", () => {
    expect(() => assertDevAuth(env({ NODE_ENV: "production" }))).toThrow(DevAuthRefused);
    expect(() => assertDevAuth(env({ SUPABASE_URL: "https://abc.supabase.co" }))).toThrow(DevAuthRefused);
    expect(() => assertDevAuth(env({ NODE_ENV: "development" }))).not.toThrow();
  });
});

describe("development login outside development", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("every dev-auth function refuses in production before it touches the database", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPABASE_URL", "");
    // Nothing listens here: a refusal must come before any query.
    vi.stubEnv("DATABASE_URL", "postgres://nobody:nothing@127.0.0.1:1/none");
    const dev = await import("@/lib/auth/dev-auth");
    await expect(dev.devSignIn("sabine@estasiweddings.nl", "academy-demo")).rejects.toThrow(DevAuthRefused);
    await expect(dev.createDevAccount("x@voorbeeld.nl", "X")).rejects.toThrow(DevAuthRefused);
    await expect(dev.deleteDevAccount(SOME_ID)).rejects.toThrow(DevAuthRefused);
    await expect(dev.setDevPassword(SOME_ID, "geheim-wachtwoord")).rejects.toThrow(DevAuthRefused);
    await expect(dev.newDevSetupLink(SOME_ID, 7)).rejects.toThrow(DevAuthRefused);
    await expect(dev.devLinkAccount("token")).rejects.toThrow(DevAuthRefused);
    await expect(dev.devPendingLink(SOME_ID)).rejects.toThrow(DevAuthRefused);
    expect(dev.devAuthAllowed()).toBe(false);
  });

  it("also refuses with Supabase configured outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
    const dev = await import("@/lib/auth/dev-auth");
    await expect(dev.devSignIn("sabine@estasiweddings.nl", "academy-demo")).rejects.toThrow(DevAuthRefused);
  });
});
