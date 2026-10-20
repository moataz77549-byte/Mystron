import { test, expect } from "@playwright/test";
import sharp from "sharp";
test("editorial workflow uses real PostgreSQL RPC/RLS with local Auth/Storage fixtures", async ({
  page,
  request,
}, info) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/admin\/login/);
  await page.getByLabel("البريد الإلكتروني").fill("fixture-owner@example.test");
  await page
    .getByLabel("كلمة المرور", { exact: true })
    .fill("Fixture-password-2026");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await page.goto("/admin/authors");
  await page
    .getByLabel("اسم الكاتب", { exact: true })
    .fill("كاتب اختبار المتصفح");
  await page
    .getByLabel("الرابط الدائم", { exact: true })
    .fill("browser-" + info.project.name);
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "كاتب اختبار المتصفح" }).first(),
  ).toBeVisible();
  await page.goto("/admin/media");
  const bytes = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#267E81" },
  })
    .png()
    .toBuffer();
  await expect(page.getByLabel("رفع صور")).toBeEnabled();
  await page.getByLabel("رفع صور").setInputFiles({
    name: "browser-test.png",
    mimeType: "image/png",
    buffer: bytes,
  });
  await page
    .getByRole("button", { name: /browser-test.png/ })
    .first()
    .click();
  await page.getByLabel("النص البديل").fill("صورة اختبار محلي");
  await page.getByRole("button", { name: "حفظ البيانات" }).click();
  await page.getByRole("button", { name: "حفظ نسخة محسنة" }).click();
  await expect(page.getByRole("button", { name: /نسخة مقصوصة/ })).toBeVisible();
  await page.getByLabel("العنوان", { exact: true }).fill("قالب اختبار محلي");
  await page.getByRole("button", { name: "توليد المعاينة" }).click();
  await expect(page.getByRole("button", { name: "تنزيل PNG" })).toBeEnabled();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "تنزيل PNG" }).click();
  expect((await download).suggestedFilename()).toBe("maystroon-template.png");
  await page.getByRole("button", { name: "إغلاق", exact: true }).click();
  await page.goto("/admin/posts/new");
  await page
    .getByLabel("عنوان المسودة")
    .fill("تدوينة اختبار " + info.project.name);
  await page.getByRole("button", { name: "إنشاء وفتح المحرر" }).click();
  await expect(page).toHaveURL(/\/edit$/);
  const id = page.url().split("/").at(-2)!;
  await page
    .getByLabel("الرابط الدائم", { exact: true })
    .fill("browser-post-" + info.project.name);
  await page
    .getByLabel("محتوى التدوينة")
    .fill("إبْداع عربي ونص طويل للاختبار.");
  await page
    .getByRole("combobox", { name: "الكاتب", exact: true })
    .selectOption({ label: "كاتب اختبار المتصفح" });
  await page.getByLabel("من بطون الكتب", { exact: true }).check();
  await page
    .getByRole("combobox", { name: "القسم الأساسي", exact: true })
    .selectOption({ label: "من بطون الكتب" });
  await expect(
    page.getByRole("status").filter({ hasText: "تم الحفظ" }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "معاينة الهاتف" }).click();
  await expect(page.locator(".article-preview")).toContainText("إبْداع عربي");
  await page.getByRole("button", { name: "معاينة الهاتف" }).click();
  await page.getByRole("button", { name: "نشر", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "منشورة" }),
  ).toBeVisible();
  await page.locator(".studio-top").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `test-results/cms-${info.project.name}.png`,
    fullPage: false,
  });
  await page.goto("/posts/browser-post-" + info.project.name);
  await expect(
    page.getByRole("heading", {
      name: "تدوينة اختبار " + info.project.name,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".article-body")).toContainText("إبْداع عربي");
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
    "content",
    "article",
  );
  const viewHeaders = {
    origin: "http://127.0.0.1:3000",
    "user-agent": "Maystroon-QA",
  };
  const view = await request.post(`/api/v1/posts/${id}/views`, {
    headers: viewHeaders,
  });
  expect(await view.json()).toMatchObject({ data: { counted: true } });
  const again = await request.post(`/api/v1/posts/${id}/views`, {
    headers: viewHeaders,
  });
  expect(await again.json()).toMatchObject({ data: { counted: false } });
  await page.getByLabel("الاسم", { exact: true }).fill("قارئ الاختبار");
  await page.getByLabel("التعليق دون روابط").fill("تعليق اختبار للمراجعة");
  await page
    .getByRole("button", { name: "إرسال للمراجعة", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("أُرسل تعليقك");
  await page.goto("/admin/comments");
  const pendingComment = page
    .locator(".catalog-card")
    .filter({ hasText: "تعليق اختبار للمراجعة" });
  await pendingComment
    .getByRole("button", { name: "قبول", exact: true })
    .click();
  // Leave moderation only after the successful server response removes the pending row.
  await expect(pendingComment).toHaveCount(0);
  await page.goto("/posts/browser-post-" + info.project.name);
  await expect(
    page
      .locator(".comment")
      .filter({ hasText: "تعليق اختبار للمراجعة" })
      .first(),
  ).toBeVisible();
  await page.goto("/search?q=ابداع");
  await expect(
    page
      .getByRole("link", {
        name: "تدوينة اختبار " + info.project.name,
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await page.goto(`/admin/posts/${id}/edit`);
  await page.getByRole("button", { name: "إلغاء النشر", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "غير منشورة" }),
  ).toBeVisible();
  const result = await request.get(
    "/api/v1/posts/browser-post-" + info.project.name,
  );
  expect(result.status()).toBe(404);
  await page.getByLabel("موعد النشر — عدن UTC+3").fill("2099-01-01T12:00");
  await page.getByRole("button", { name: "جدولة", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "مجدولة" }),
  ).toBeVisible();
  const cron = await request.get("/api/v1/cron/publish", {
    headers: { authorization: "Bearer fixture-only-cron-secret-32-characters" },
  });
  expect(cron.status()).toBe(200);
  expect(await cron.json()).toMatchObject({ data: 0 });
  await page.getByRole("button", { name: "إلغاء الجدولة / مسودة" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "مسودة" }),
  ).toBeVisible();
});
