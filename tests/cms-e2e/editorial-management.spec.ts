import { test as base, expect } from "@playwright/test";
// Separate simulated clients retain the real production rate limiter.
const test = base.extend({
  extraHTTPHeaders: async ({}, provide, info) => {
    const index = info.title.startsWith("scoped tag manager") ? 0 : 1;
    await provide({
      "x-vercel-forwarded-for": `192.0.2.${100 + index + (info.project.name === "mobile" ? 10 : 0)}`,
    });
  },
});
async function login(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page
    .getByLabel("البريد الإلكتروني", { exact: true })
    .fill("fixture-owner@example.test");
  await page
    .getByLabel("كلمة المرور", { exact: true })
    .fill("Fixture-password-2026");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/admin\/dashboard/);
}
test("scoped tag manager saves through real SQL and remains usable on phone widths", async ({
  page,
}, info) => {
  await login(page);
  const source = "وسم-قديم-" + info.project.name;
  const target = "وسم-موحد-" + info.project.name;
  for (let index = 0; index < 2; index++) {
    const result = await page.evaluate(
      async ({ source, index, project }) => {
        const response = await fetch("/api/v1/admin/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: null,
            patch: {
              title: "تدوينة اختبار وسوم",
              slug: "tag-browser-" + project + "-" + index,
              tags: [source],
            },
          }),
        });
        return response.status;
      },
      { source, index, project: info.project.name },
    );
    expect(result).toBe(200);
  }
  await page.goto("/admin/tags");
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: source, exact: true }) });
  await card
    .getByRole("button", { name: "إعادة تسمية أو دمج", exact: true })
    .click();
  await page.getByLabel("الوسم الجديد", { exact: true }).fill(target);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "تأكيد إعادة التسمية أو الدمج", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("تم تحديث 2");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: target, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: source, exact: true }),
  ).toHaveCount(0);
  for (const width of [360, 390, 412, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/tags-" + info.project.name + "-" + width + ".png",
    });
  }
});
test("password recovery feedback and account controls are accessible without sending real mail", async ({
  page,
}, info) => {
  await page.goto("/admin/login");
  await page.getByText("نسيت كلمة المرور؟", { exact: true }).click();
  await page.route("**/auth/recovery", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      headers: { "Retry-After": "900" },
      body: JSON.stringify({ error: { code: "RATE_LIMITED" } }),
    }),
  );
  await page
    .getByLabel("بريد استعادة كلمة المرور", { exact: true })
    .fill("fixture-owner@example.test");
  await page
    .getByRole("button", { name: "إرسال رابط الاستعادة", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "تجاوزت عدد المحاولات" }),
  ).toBeVisible();
  await login(page);
  await page.goto("/admin/account");
  await page
    .getByLabel("كلمة المرور الجديدة", { exact: true })
    .fill("Long-fixture-password-1");
  await page
    .getByLabel("تأكيد كلمة المرور الجديدة", { exact: true })
    .fill("Different-fixture-password-2");
  await page
    .getByRole("button", { name: "حفظ كلمة المرور", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "غير متطابقتين" }),
  ).toBeVisible();
  for (const width of [360, 390, 412, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/account-" + info.project.name + "-" + width + ".png",
    });
  }
  await page.goto("/admin/reports");
  await expect(
    page.getByRole("heading", { name: "بلاغات التعليقات", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("لا توجد بلاغات في هذه القائمة.", { exact: true }),
  ).toBeVisible();
});
