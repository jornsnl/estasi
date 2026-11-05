import { describe, expect, it } from "vitest";
import { createSeed } from "@/lib/data/seed";
import { fromRow, isUuid, toRow } from "@/lib/data/supabase-rows";
import type { Enrollment, User } from "@/lib/data/types";

const seed = createSeed();

describe("supabase rows", () => {
  it("writes snake_case columns and never the local password fields", () => {
    const row = toRow("users", seed.users[0]);
    expect(row).toMatchObject({ email: "sabine@estasiweddings.nl", role: "owner" });
    expect(row).toHaveProperty("last_active_at");
    expect(row).toHaveProperty("activated_at");
    expect(row).not.toHaveProperty("password_hash");
    expect(row).not.toHaveProperty("setup_token");
  });

  it("round trips every seeded entity", () => {
    const cases = [
      ["profiles", seed.profiles],
      ["enrollments", seed.enrollments],
      ["modules", seed.modules],
      ["lessons", seed.lessons],
      ["answers", seed.answers],
      ["lesson_completions", seed.completions],
    ] as const;
    for (const [table, items] of cases) {
      for (const item of items) expect(fromRow(table, toRow(table, item))).toEqual(item);
    }
  });

  it("reads users back with empty local auth fields", () => {
    const user = fromRow<User>("users", toRow("users", seed.users[1]));
    expect(user.passwordHash).toBeNull();
    expect(user.setupToken).toBeNull();
    expect(user.email).toBe("lotte@voorbeeld.nl");
  });

  it("only writes the fields of a patch", () => {
    expect(toRow("enrollments", { revokedAt: null, ownerNotes: "x" }, true)).toEqual({ revoked_at: null, owner_notes: "x" });
    expect(toRow("users", { lastActiveAt: "2026-01-01T00:00:00.000Z" }, true)).toEqual({ last_active_at: "2026-01-01T00:00:00.000Z" });
  });

  it("normalises Postgres timestamps to ISO strings", () => {
    const e = fromRow<Enrollment>("enrollments", {
      ...toRow("enrollments", seed.enrollments[0]),
      ends_at: "2027-03-01 12:00:00+00",
      paused_at: null,
    });
    expect(e.endsAt).toBe("2027-03-01T12:00:00.000Z");
    expect(e.pausedAt).toBeNull();
  });

  it("recognises uuids", () => {
    expect(isUuid("3f2b8c4e-1d2a-4b6c-9e8f-0a1b2c3d4e5f")).toBe(true);
    expect(isUuid("les-1-1")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});
