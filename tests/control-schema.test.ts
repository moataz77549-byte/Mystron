import { it, expect } from "vitest";
import {
  settingSchemas,
  settingDefaults,
} from "../src/lib/control/settings-schema";
import { integrationSchema, csvCell } from "../src/lib/control/schema";
import { maintenanceResponse } from "../src/lib/control/maintenance";
it("every default validates and settings reject executable or unknown keys", () => {
  for (const key of Object.keys(
    settingSchemas,
  ) as (keyof typeof settingSchemas)[])
    expect(settingSchemas[key].safeParse(settingDefaults[key]).success).toBe(
      true,
    );
  expect(
    settingSchemas.identity.safeParse({
      ...settingDefaults.identity,
      css: "body{}",
    }).success,
  ).toBe(false);
  expect(
    settingSchemas.identity.safeParse({
      ...settingDefaults.identity,
      socials: [{ label: "رابط", url: "javascript:alert(1)" }],
    }).success,
  ).toBe(false);
  expect(
    settingSchemas.comments.safeParse({
      ...settingDefaults.comments,
      max_depth: 99,
    }).success,
  ).toBe(false);
});
it("integration fields never accept tokens", () => {
  expect(
    integrationSchema.safeParse({
      id: "telegram",
      enabled: true,
      config: { token: "secret" },
    }).success,
  ).toBe(false);
});
it("CSV export escapes formulas, quotes and leading whitespace", () => {
  expect(csvCell("=SUM(A1)")).toBe('"\'=SUM(A1)"');
  expect(csvCell(" +1")).toBe('"\' +1"');
  expect(csvCell('عنوان "جميل"')).toBe('"عنوان ""جميل"""');
});
it("maintenance returns real 503 and escapes untrusted message text", async () => {
  const r = maintenanceResponse("ما يسطرون", "<script>bad()</script>");
  expect(r.status).toBe(503);
  expect(r.headers.get("Retry-After")).toBe("3600");
  const text = await r.text();
  expect(text).toContain('dir="rtl"');
  expect(text).not.toContain("<script>");
  expect(text).toContain("&lt;script&gt;");
});
