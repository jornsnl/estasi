import { describe, expect, it } from "vitest";
import { plural, PACKAGE_LABELS } from "@/lib/domain/labels";

describe("labels", () => {
  it("gebruikt enkelvoud bij 1", () => {
    expect(plural(1, "vraag", "vragen")).toBe("1 vraag");
    expect(plural(0, "vraag", "vragen")).toBe("0 vragen");
    expect(plural(3, "blok", "blokken")).toBe("3 blokken");
  });
  it("heeft één naam per pakket", () => {
    expect(PACKAGE_LABELS.B).toBe("Online + praktijk");
  });
});
