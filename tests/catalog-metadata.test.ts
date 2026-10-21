import { expect, it } from "vitest";
import { categoryAccent } from "../src/lib/editorial/catalog-metadata";
it("limits public category accents to opaque hex and falls back for unsafe or legacy input", () => {
  expect(categoryAccent("#C77955")).toBe("#C77955");
  for (const value of [
    null,
    undefined,
    "red",
    "#fff",
    "#12345678",
    "#123456;background:url(https://example.test)",
  ]) {
    expect(categoryAccent(value)).toBe("#267E81");
  }
});
