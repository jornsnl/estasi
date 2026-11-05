import { describe, expect, it } from "vitest";
import { clear, hit, isLimited } from "@/lib/auth/rate-limit";

const limit = { max: 3, windowMs: 1000 };

describe("rate limit", () => {
  it("blocks after max failures and opens again after the window", () => {
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(isLimited(key, limit, 0)).toBe(false);
      hit(key, limit, 0);
    }
    expect(isLimited(key, limit, 500)).toBe(true);
    expect(isLimited(key, limit, 1000)).toBe(false);
  });

  it("clears on success", () => {
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 3; i++) hit(key, limit, 0);
    clear(key);
    expect(isLimited(key, limit, 0)).toBe(false);
  });
});
