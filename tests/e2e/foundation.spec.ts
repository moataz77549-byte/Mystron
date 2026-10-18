import { test, expect } from "@playwright/test";
test.skip(
  process.env.LIVE_SUPABASE_SMOKE === "1",
  "Unconfigured foundation tests",
);
test("Arabic empty foundation, navigation and responsive layout", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.screenshot({ path: info.outputPath("home.png"), fullPage: true });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: "أحدث ما سُطّر" }),
  ).toBeVisible();
  await expect(page.getByText("لم تُنشر تدوينات بعد")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "تعرّف على ما يسطرون" }).click();
  await expect(page).toHaveURL(/about/);
  await page.getByRole("link", { name: "سياسة الخصوصية" }).click();
  await expect(
    page.getByRole("heading", { name: "سياسة الخصوصية" }),
  ).toBeVisible();
});
test("theme persists, admin is server protected, API reports unconfigured", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "تبديل الوضع الفاتح والداكن" })
    .click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.goto("/admin/posts");
  await expect(page).toHaveURL(/admin\/login/);
  await expect(page.getByText("تسجيل الدخول غير مفعّل")).toBeVisible();
  const r = await request.get("/api/v1/posts");
  expect(r.status()).toBe(503);
  expect((await r.json()).error.code).toBe("DATABASE_NOT_CONFIGURED");
  const h = await request.get("/api/v1/health");
  expect((await h.json()).data.database).toBe("unconfigured");
  expect(
    (await request.post("/auth/pin", { data: { pin: "123456" } })).status(),
  ).toBe(403);
});
test("mobile menu and reduced motion", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  if (info.project.name === "mobile") {
    const button = page.getByRole("button", { name: "فتح القائمة" });
    await button.click();
    await expect(
      page.getByRole("button", { name: "إغلاق القائمة" }),
    ).toHaveAttribute("aria-expanded", "true");
    await page
      .getByRole("navigation", { name: "قائمة الهاتف" })
      .getByRole("link", { name: "حول ما يسطرون" })
      .click();
    await expect(page).toHaveURL(/about/);
  }
  await page.goto("/search");
  await expect(page.getByText("البحث قيد التجهيز")).toBeVisible();
});

test("disabled AI stays accessible and signed gateways reject visitors", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "فتح مساعد ما يسطرون", exact: true }),
  ).toHaveCount(0);
  await page.goto("/assistant");
  await expect(
    page.getByRole("region", { name: "مساعد ما يسطرون", exact: true }),
  ).toContainText("المساعد غير مفعّل حالياً. يظل البحث العادي متاحاً.");
  await expect(page.getByLabel("سؤالك عن ما يسطرون")).toBeDisabled();
  expect((await request.get("/api/v1/ai/status")).status()).toBe(200);
  expect(
    (
      await request.post("/api/v1/ai/chat", { data: { message: "سؤال" } })
    ).status(),
  ).toBe(503);
  expect(
    (
      await request.post("/api/v1/ai/chat", {
        headers: { Origin: "https://untrusted.invalid" },
        data: { message: "سؤال" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/v1/internal/automation/work", { data: {} })
    ).status(),
  ).toBe(401);
});
