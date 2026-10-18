import { test, expect } from "@playwright/test";
async function login(
  page: import("@playwright/test").Page,
  email = "fixture-owner@example.test",
) {
  await page.goto("/admin/login");
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(email);
  await page
    .getByLabel("كلمة المرور", { exact: true })
    .fill("Fixture-password-2026");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/admin\/dashboard/);
}
test("control center enforces PIN, saves settings, menus, maintenance and scoped access", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  await login(page);
  await expect(
    page.getByRole("heading", { name: "مركز التحكم", exact: true }),
  ).toBeVisible();
  await page.goto("/admin/security");
  await page
    .getByRole("button", {
      name: /تعيين PIN|تغيير أو إعادة تعيين PIN/,
      exact: true,
    })
    .click();
  await page.getByLabel("PIN جديد", { exact: true }).fill("39271486");
  await page
    .getByLabel("كلمة المرور الحالية", { exact: true })
    .fill("Fixture-password-2026");
  await page.getByRole("button", { name: "حفظ PIN", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "نجح التحقق" }),
  ).toBeVisible();
  await page.goto("/admin/settings?tab=general");
  await page.getByLabel("اسم المنصة", { exact: true }).fill("ما يسطرون");
  await page
    .getByLabel("الوصف", { exact: true })
    .fill("مساحة للمعرفة والحكاية");
  await page
    .getByRole("button", { name: "معاينة التغييرات", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "معاينة قبل الاعتماد" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "اعتماد التغييرات", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "حُفظت الإعدادات" }),
  ).toBeVisible();
  await page.goto("/admin/menus");
  await page
    .getByLabel("النص", { exact: true })
    .fill("دليل القراءة " + info.project.name);
  await page.getByLabel("الرابط للصفحة أو الموقع الخارجي").fill("/about");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "تم الحفظ" }),
  ).toBeVisible();
  await page.goto("/");
  if (info.project.name === "mobile")
    await page
      .getByRole("button", { name: "فتح القائمة", exact: true })
      .click();
  await expect(
    page
      .getByRole("link", { name: "دليل القراءة " + info.project.name })
      .first(),
  ).toBeAttached();
  await page.goto("/admin/analytics");
  await expect(
    page.getByRole("heading", { name: "مركز التحليلات", exact: true }),
  ).toBeVisible();
  const exported = await page.request.get("/api/v1/admin/analytics?format=csv");
  expect(exported.status()).toBe(200);
  expect(exported.headers()["content-type"]).toContain("text/csv");
  await page.goto("/admin/settings?tab=maintenance");
  await page.getByLabel("مفعّل", { exact: true }).check();
  await page.getByLabel("رسالة الصيانة").fill("صيانة اختبار محلي فقط");
  await page
    .getByRole("button", { name: "معاينة التغييرات", exact: true })
    .click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "اعتماد التغييرات", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "حُفظت الإعدادات" }),
  ).toBeVisible();
  expect((await page.request.get("/api/v1/posts")).status()).toBe(503);
  expect((await page.request.get("/api/v1/health")).status()).toBe(200);
  const cron = await page.request.get("/api/v1/cron/publish");
  expect(await cron.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  expect(cron.status()).toBe(401);
  const maintenance = await page.request.get("/");
  expect(maintenance.status()).toBe(503);
  expect(await maintenance.text()).toContain("صيانة اختبار محلي فقط");
  await page.getByLabel("مفعّل", { exact: true }).uncheck();
  await page
    .getByRole("button", { name: "معاينة التغييرات", exact: true })
    .click();
  await page
    .getByRole("button", { name: "اعتماد التغييرات", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "حُفظت الإعدادات" }),
  ).toBeVisible();
  await page.goto("/admin/users");
  await expect(
    page.getByRole("heading", { name: "إدارة المشرفين", exact: true }),
  ).toBeVisible();
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "فتح تنقل الإدارة" }).click();
    await expect(page.locator("#admin-navigation")).toBeVisible();
    await page.getByRole("button", { name: "إغلاق تنقل الإدارة" }).click();
    await expect(page.locator(".data-records")).toBeVisible();
    await expect(page.locator(".data-table table")).toBeHidden();
  } else {
    await expect(page.locator(".data-records")).toBeHidden();
    await expect(page.locator(".data-table table")).toBeVisible();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `docs/screenshots/stage-3-${info.project.name}-fixture.png`,
    fullPage: true,
  });
  const restricted = await browser.newContext();
  const author = await restricted.newPage();
  await login(author, "fixture-author@example.test");
  expect((await author.request.get("/api/v1/admin/users")).status()).toBe(403);
  expect((await author.request.get("/api/v1/admin/analytics")).status()).toBe(
    403,
  );
  const attempt = await author.request.post("/api/v1/admin/roles", {
    headers: { Origin: "http://127.0.0.1:3000" },
    data: {
      role_id: "00000000-0000-4000-8000-000000000000",
      permission: "users.manage",
      scope: "all",
      enabled: true,
    },
  });
  expect(attempt.status()).toBe(403);
  await restricted.close();
});
