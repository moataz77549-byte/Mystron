import { test as base, expect } from "@playwright/test";
// Separate simulated clients retain the real production rate limiter.
const test = base.extend({
  extraHTTPHeaders: async ({}, provide, info) => {
    const index = [
      "scoped tag manager",
      "password recovery",
      "catalog metadata",
      "account sessions",
      "static pages",
      "editorial approval",
    ].findIndex((prefix) => info.title.startsWith(prefix));
    await provide({
      "x-vercel-forwarded-for": `192.0.2.${100 + index + (info.project.name === "mobile" ? 10 : 0)}`,
    });
  },
});
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
test("account sessions let an author inspect only their account without security management permission", async ({
  page,
}) => {
  await login(page, "fixture-author@example.test");
  await page.goto("/admin/account/sessions");
  await expect(
    page.getByRole("heading", { name: "جلساتي الإدارية", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "الجلسة الحالية", exact: true }),
  ).toBeVisible();
  const denied = await page.request.post("/api/v1/admin/account/sessions", {
    headers: { origin: "http://127.0.0.1:3000" },
    data: { id: "11111111-1111-4111-8111-111111111111" },
  });
  expect(denied.status()).toBe(404);
  expect(await denied.json()).toEqual({ error: { code: "NOT_FOUND" } });
});
test("catalog metadata persists and appears on public category and author pages", async ({
  page,
}, info) => {
  await login(page);
  const slug = "metadata-browser-" + info.project.name;
  await page.goto("/admin/categories");
  await page
    .getByLabel("اسم القسم", { exact: true })
    .fill("قسم تخصصي " + info.project.name);
  await page.getByLabel("الرابط الدائم", { exact: true }).fill(slug);
  await page.getByLabel("لون القسم", { exact: true }).fill("#c77955");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  const category = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "قسم تخصصي " + info.project.name,
      exact: true,
    }),
  });
  await category.getByRole("button", { name: "تعديل", exact: true }).click();
  await expect(page.getByLabel("لون القسم", { exact: true })).toHaveValue(
    "#c77955",
  );
  await page.goto("/categories/" + slug);
  const heading = page.getByRole("heading", {
    name: "قسم تخصصي " + info.project.name,
    exact: true,
  });
  await expect(heading).toBeVisible();
  await expect(page.locator("section.prose")).toHaveCSS(
    "border-top-color",
    "rgb(199, 121, 85)",
  );
  await page.goto("/admin/authors");
  await page
    .getByLabel("اسم الكاتب", { exact: true })
    .fill("كاتب متخصص " + info.project.name);
  await page.getByLabel("الرابط الدائم", { exact: true }).fill(slug);
  await page
    .getByLabel("التخصص", { exact: true })
    .fill("الأدب والثقافة العربية");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "كاتب متخصص " + info.project.name,
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/authors/" + slug);
  await expect(
    page.getByText("الأدب والثقافة العربية", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
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
test("editorial approval survives reload and expires on content change", async ({
  page,
}, info) => {
  await login(page);
  const headers = { origin: "http://127.0.0.1:3000" };
  const created = await page.request.post("/api/v1/admin/posts", {
    headers,
    data: {
      patch: {
        title: "اعتماد المتصفح " + info.project.name,
        slug: "approval-browser-" + info.project.name,
      },
    },
  });
  expect(created.status()).toBe(200);
  let { data: row } = await created.json();
  const review = await page.request.post("/api/v1/admin/transitions", {
    headers,
    data: { id: row.id, version: row.version, action: "review" },
  });
  expect(review.status()).toBe(200);
  row = (await review.json()).data;
  await page.goto(`/admin/posts/${row.id}/edit`);
  await page
    .getByRole("button", { name: "اعتماد النسخة الحالية", exact: true })
    .click();
  await expect(page.locator(".studio-top [role=status]")).toContainText(
    "معتمد تحريرياً",
  );
  await page.reload();
  await expect(page.locator(".studio-top [role=status]")).toContainText(
    "معتمد تحريرياً",
  );
  await page
    .getByLabel("العنوان", { exact: true })
    .fill("عنوان معدل بعد الاعتماد " + info.project.name);
  await expect(page.locator(".studio-top [role=status]")).not.toContainText(
    "معتمد تحريرياً",
  );
  await page.getByRole("button", { name: "حفظ الآن", exact: true }).click();
  await expect(page.locator(".studio-top [role=status]")).toContainText(
    "تم الحفظ",
  );
  await page.goto("/admin/posts?status=approved");
  await expect(
    page.getByRole("link", {
      name: "عنوان معدل بعد الاعتماد " + info.project.name,
      exact: true,
    }),
  ).toHaveCount(0);
});
test("static pages publish, render safe content, retain paths and unpublish on mobile", async ({
  page,
}, info) => {
  await login(page);
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
  await page.goto("/admin/pages");
  const slug = "page-browser-" + info.project.name;
  await page
    .getByLabel("عنوان الصفحة", { exact: true })
    .fill("صفحة تجريبية معزولة " + info.project.name);
  await page.getByLabel("رابط الصفحة", { exact: true }).fill(slug);
  await page
    .getByLabel("وصف الصفحة", { exact: true })
    .fill("وصف محفوظ للقراءة");
  await page
    .getByLabel("محتوى الصفحة", { exact: true })
    .fill("نص عربي آمن <script>alert(1)</script>");
  await page.getByRole("button", { name: "حفظ الصفحة", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("تم الحفظ.");
  const hidden = await page.request.get("/pages/" + slug);
  // Next.js keeps 200 when notFound resolves after streaming starts.
  expect([200, 404]).toContain(hidden.status());
  const hiddenHtml = await hidden.text();
  expect(hiddenHtml).toContain('name="robots" content="noindex"');
  expect(hiddenHtml).not.toContain("نص عربي آمن");
  expect(hiddenHtml).not.toContain("صفحة تجريبية معزولة " + info.project.name);
  await page.getByLabel("نشر الصفحة للعامة", { exact: true }).check();
  await page.getByRole("button", { name: "حفظ الصفحة", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("تم الحفظ.");
  await page.goto("/pages/" + slug);
  await expect(
    page.getByRole("heading", {
      name: "صفحة تجريبية معزولة " + info.project.name,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("نص عربي آمن <script>alert(1)</script>", { exact: true }),
  ).toBeVisible();
  expect(await page.locator("article script").count()).toBe(0);
  await expect(page).toHaveTitle(/صفحة تجريبية معزولة/);
  await page.goto("/admin/pages");
  await page
    .getByRole("button", {
      name: "فتح صفحة تجريبية معزولة " + info.project.name,
      exact: true,
    })
    .click();
  await expect(page.getByLabel("رابط الصفحة", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  await page.getByLabel("نشر الصفحة للعامة", { exact: true }).uncheck();
  await page.getByRole("button", { name: "حفظ الصفحة", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("تم الحفظ.");
  const unpublished = await page.request.get("/pages/" + slug);
  expect([200, 404]).toContain(unpublished.status());
  const unpublishedHtml = await unpublished.text();
  expect(unpublishedHtml).toContain('name="robots" content="noindex"');
  expect(unpublishedHtml).not.toContain("نص عربي آمن");
  expect(unpublishedHtml).not.toContain(
    "صفحة تجريبية معزولة " + info.project.name,
  );
  for (const width of [360, 390, 412, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/pages-${info.project.name}-${width}.png`,
    });
  }
});
