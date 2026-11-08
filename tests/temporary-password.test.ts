import { describe, expect, it } from "vitest";
import { generateTemporaryPassword, temporaryPasswordProblem } from "@/lib/auth/temporary-password";

describe("tijdelijk wachtwoord", () => {
  it("is lang genoeg, leesbaar en elke keer anders", () => {
    const a = generateTemporaryPassword();
    expect(a).toMatch(/^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/);
    expect(a).not.toMatch(/[01lIO]/);
    expect(temporaryPasswordProblem(a)).toBeNull();
    expect(new Set(Array.from({ length: 50 }, generateTemporaryPassword)).size).toBe(50);
  });
  it("weigert te korte of te lange wachtwoorden", () => {
    expect(temporaryPasswordProblem("kort")).toMatch(/minimaal/);
    expect(temporaryPasswordProblem("x".repeat(201))).toMatch(/maximaal/);
  });
});
