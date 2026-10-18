import { test, expect } from "@playwright/test";
test.skip(
  process.env.LIVE_SUPABASE_SMOKE !== "1",
  "Opt-in read-only live database check",
);
test("connected Supabase supplies six real categories and empty articles", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.locator(".category-card")).toHaveCount(6);
  await expect(page.getByText("لم تُنشر تدوينات بعد")).toBeVisible();
  await expect(
    page.getByText("المنصة في مرحلة التأسيس. لم يُربط مصدر المحتوى بعد."),
  ).toHaveCount(0);
  const h = await request.get("/api/v1/health");
  expect((await h.json()).data.database).toBe("ready");
});
test("connected database does not grant owner access by email or bypass server config", async ({
  page,
  request,
}) => {
  await page.goto("/admin/account");
  await expect(page).toHaveURL(/admin\/login/);
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
  const api = await request.get("/api/v1/categories");
  expect(api.status()).toBe(503);
  expect((await api.json()).error.code).toBe("SERVICE_UNAVAILABLE");
});
