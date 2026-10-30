import { test, expect } from "@playwright/test";
import { publicPostPageDto } from "../../packages/contracts/public-reader";
test.skip(
  process.env.LIVE_SUPABASE_SMOKE !== "1",
  "Opt-in read-only live database check",
);
test("live public API responds with real contracts without assuming an empty production database", async ({
  page,
  request,
}) => {
  const health = await request.get("/api/v1/health");
  expect(health.status()).toBe(200);
  expect((await health.json()).data).toMatchObject({
    database: "ready",
    api: "ready",
  });
  for (const path of ["/api/v1/categories", "/api/v1/authors"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(Array.isArray((await response.json()).data)).toBe(true);
  }
  for (const path of [
    "/api/v1/posts?pageSize=1",
    "/api/v1/search?q=ثقافة&pageSize=1",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(publicPostPageDto.safeParse(await response.json()).success).toBe(
      true,
    );
  }
  const settings = await request.get("/api/v1/site/settings");
  expect(settings.status()).toBe(200);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("live administrative reads reject guests while public categories remain available", async ({
  page,
  request,
}) => {
  await page.goto("/admin/account");
  await expect(page).toHaveURL(/admin\/login/);
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
  const admin = await request.get("/api/v1/admin/data?resource=posts");
  expect(admin.status()).toBe(401);
  expect((await admin.json()).error.code).toBe("UNAUTHORIZED");
  expect((await request.get("/api/v1/categories")).status()).toBe(200);
});
