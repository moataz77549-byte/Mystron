import { test as base, expect, type Page } from "@playwright/test";
// Independent clients keep their real rate limits; no limiter is bypassed.
const test = base.extend({
  extraHTTPHeaders: async ({}, provide, info) => {
    const index = [
      "typing during",
      "offline draft",
      "structured literary",
      "revision restoration",
    ].findIndex((prefix) => info.title.startsWith(prefix));
    await provide({
      "x-vercel-forwarded-for": `192.0.2.${50 + index + (info.project.name === "mobile" ? 10 : 0)}`,
    });
  },
});
async function createDraft(page: Page, suffix: string) {
  await page.goto("/admin/login");
  await page
    .getByLabel("البريد الإلكتروني", { exact: true })
    .fill("fixture-owner@example.test");
  await page
    .getByLabel("كلمة المرور", { exact: true })
    .fill("Fixture-password-2026");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/admin\/dashboard/);
  const result = await page.request.post("/api/v1/admin/posts", {
    headers: { origin: "http://127.0.0.1:3000" },
    data: {
      patch: {
        title: `اختبار استقرار ${suffix}`,
        slug: `reliability-${suffix}`,
        content_json: { type: "doc", content: [{ type: "paragraph" }] },
      },
    },
  });
  expect(result.status()).toBe(200);
  const { data } = await result.json();
  await page.goto(`/admin/posts/${data.id}/edit`);
  await expect(page.getByLabel("محتوى التدوينة")).toBeVisible();
  return data.id as string;
}
test("typing during an in-flight save is persisted in the next confirmed version", async ({
  page,
}, info) => {
  await createDraft(page, `inflight-${info.project.name}`);
  let release: (() => void) | undefined;
  let started: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saves = 0;
  await page.route("**/api/v1/admin/posts", async (route) => {
    if (++saves === 1) {
      started?.();
      await gate;
    }
    await route.continue();
  });
  const title = page.getByLabel("العنوان", { exact: true });
  await title.fill("العنوان الأول قبل بدء الحفظ");
  await pending;
  await expect(title).toBeEnabled();
  await title.fill("العنوان النهائي أثناء حفظ الإصدار السابق");
  release?.();
  await expect(
    page.getByRole("status").filter({ hasText: "تم الحفظ" }),
  ).toBeVisible();
  await page.reload();
  await expect(title).toHaveValue("العنوان النهائي أثناء حفظ الإصدار السابق");
  expect(saves).toBeGreaterThanOrEqual(2);
});
test("offline draft survives reload, recovery is explicit, and server conflicts preserve writing", async ({
  page,
  context,
}, info) => {
  const id = await createDraft(page, `offline-${info.project.name}`);
  await context.setOffline(true);
  await page
    .getByLabel("العنوان", { exact: true })
    .fill("مسودة غير متصلة تنتظر الاستعادة");
  await page
    .getByLabel("محتوى التدوينة")
    .fill("نص عربي بِتَشْكِيلٍ محفوظ محلياً");
  await expect
    .poll(() =>
      page.evaluate(
        (postId) =>
          Object.keys(localStorage).some(
            (key) =>
              key.startsWith("maystroon-draft-v2:") && key.endsWith(postId),
          ),
        id,
      ),
    )
    .toBe(true);
  // Abort navigation deliberately only after the local backup is confirmed.
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("about:blank");
  await context.setOffline(false);
  await page.goto(`/admin/posts/${id}/edit`);
  await expect(
    page.getByRole("heading", { name: "مسودة متصفح تنتظر المراجعة" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "استعادة هذه المسودة", exact: true })
    .click();
  await expect(page.getByLabel("العنوان", { exact: true })).toHaveValue(
    "مسودة غير متصلة تنتظر الاستعادة",
  );
  await expect(
    page.getByRole("status").filter({ hasText: "تم الحفظ" }),
  ).toBeVisible();
  await page.route("**/api/v1/admin/posts", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "VERSION_CONFLICT" } }),
    }),
  );
  await page
    .getByLabel("العنوان", { exact: true })
    .fill("نسخة تحتاج مراجعة تعارض");
  await page.getByRole("button", { name: "حفظ الآن", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "يوجد إصدار أحدث لدى الخادم" }),
  ).toBeVisible();
  await expect(page.getByLabel("العنوان", { exact: true })).toHaveValue(
    "نسخة تحتاج مراجعة تعارض",
  );
  await expect(
    page.getByRole("button", { name: "حفظ الآن", exact: true }),
  ).toBeDisabled();
  const cached = await page.evaluate(
    (postId) =>
      JSON.parse(
        localStorage.getItem(
          Object.keys(localStorage).find(
            (key) =>
              key.startsWith("maystroon-draft-v2:") && key.endsWith(postId),
          )!,
        ) || "null",
      ),
    id,
  );
  expect(cached.title).toBe("نسخة تحتاج مراجعة تعارض");
});
test("structured literary nodes, multiple tags and references remain editable after save", async ({
  page,
}, info) => {
  await createDraft(page, `literary-${info.project.name}`);
  await page
    .getByLabel("الوسوم (فواصل عربية)", { exact: true })
    .fill("أدب،ثقافة");
  await page.getByRole("button", { name: "بيت شعري", exact: true }).click();
  await page.getByLabel("الشطر الأول").fill("شَطْرٌ أوّل  بمسافتين");
  await page.getByLabel("الشطر الثاني").fill("وشطرٌ ثانٍ");
  await page.getByRole("button", { name: "اقتباس موثّق", exact: true }).click();
  await page
    .getByLabel("نص الاقتباس")
    .fill("نص اختبار أدبي لا يُنسب إلى شخص حقيقي");
  await page.getByLabel("اسم القائل").fill("كاتب الاختبار المحلي");
  await page.getByRole("button", { name: "إضافة مصدر", exact: true }).click();
  await page
    .getByLabel("اسم المصدر", { exact: true })
    .fill("مرجع مطبوع بلا رابط");
  await page.getByLabel("رقم الصفحة", { exact: true }).fill("42");
  await expect(
    page.getByRole("status").filter({ hasText: "تم الحفظ" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("الشطر الأول")).toHaveValue(
    "شَطْرٌ أوّل  بمسافتين",
  );
  await expect(page.getByLabel("اسم المصدر", { exact: true })).toHaveValue(
    "مرجع مطبوع بلا رابط",
  );
  await expect(
    page.getByLabel("الوسوم (فواصل عربية)", { exact: true }),
  ).toHaveValue("أدب،ثقافة");
  await page.getByRole("button", { name: "معاينة الهاتف" }).click();
  await expect(
    page.locator(".article-preview .editor-poetry-verse"),
  ).toContainText("وشطرٌ ثانٍ");
  await expect(page.locator(".article-preview .editor-citation")).toContainText(
    "كاتب الاختبار المحلي",
  );
  for (const width of [360, 390, 412, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `editor overflow at ${width}px`,
    ).toBe(true);
    await page.screenshot({
      path: `test-results/editor-${info.project.name}-${width}.png`,
    });
  }
});

test("revision restoration prevents new edits and duplicate requests until the server version reloads", async ({
  page,
}, info) => {
  await createDraft(page, `restore-lock-${info.project.name}`);
  await page
    .getByLabel("العنوان", { exact: true })
    .fill("عنوان جديد قبل الاستعادة");
  await page.getByRole("button", { name: "حفظ الآن", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "تم الحفظ" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "سجل النسخ السابقة", exact: true })
    .click();
  const restore = page
    .getByRole("button", { name: "استعادة", exact: true })
    .first();
  await expect(restore).toBeVisible();
  let started!: () => void;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/api/v1/admin/revisions", async (route) => {
    requests++;
    started();
    await gate;
    await route.continue();
  });
  await restore.click();
  await pending;
  await expect(page.getByLabel("محتوى التدوينة")).toHaveAttribute(
    "contenteditable",
    "false",
  );
  await expect(restore).toBeDisabled();
  await expect(page.locator(".studio > div[inert]")).toHaveCount(1);
  release();
  await expect(page.getByLabel("محتوى التدوينة")).toHaveAttribute(
    "contenteditable",
    "true",
  );
  await expect(page.getByLabel("العنوان", { exact: true })).toBeEditable();
  expect(requests).toBe(1);
});
