import { describe, it, expect } from "vitest";
import { querySchema, pinSchema, uploadSchema } from "../src/lib/validation";
import { hashPin, verifyPin } from "../src/lib/pin";
describe("input boundaries", () => {
  it("limits pagination and sorting", () => {
    expect(querySchema.parse({}).pageSize).toBe(12);
    expect(querySchema.safeParse({ pageSize: "100" }).success).toBe(false);
    expect(querySchema.safeParse({ sort: "status" }).success).toBe(false);
    expect(querySchema.safeParse({ category: "x,or=1" }).success).toBe(false);
  });
  it("rejects executable and oversized files", () => {
    expect(
      uploadSchema.safeParse({ type: "image/svg+xml", size: 100 }).success,
    ).toBe(false);
    expect(
      uploadSchema.safeParse({ type: "image/jpeg", size: 6 * 1024 * 1024 })
        .success,
    ).toBe(false);
  });
  it("requires nondefault PIN and pepper; salted hashes verify", () => {
    expect(pinSchema.safeParse("123").success).toBe(false);
    process.env.PIN_PEPPER = "test-only-pepper-with-at-least-32-characters";
    const a = hashPin("823947");
    expect(a).not.toContain("823947");
    expect(hashPin("823947")).not.toBe(a);
    expect(verifyPin("823947", a)).toBe(true);
    expect(verifyPin("000000", a)).toBe(false);
    delete process.env.PIN_PEPPER;
    expect(() => hashPin("823947")).toThrow();
  });
});
