import { test, expect } from "@playwright/test";
import { createHmac, createHash, randomBytes } from "node:crypto";
test("AI HTTP protocol, grounded summary, cache, admin controls and gateway replay", async ({
  page,
}, info) => {
  const guest = await page.request.get("/api/v1/admin/ai/providers");
  expect(guest.status()).toBe(401);
  const unsigned = await page.request.post("/api/v1/internal/automation/work", {
    data: {},
  });
  expect(unsigned.status()).toBe(401);
  await page.goto("/admin/login");
  await page
    .getByLabel("البريد الإلكتروني", { exact: true })
    .fill("fixture-owner@example.test");
  await page
    .getByLabel("كلمة المرور", { exact: true })
    .fill("Fixture-password-2026");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/admin\/dashboard/);
  await page.goto("/admin/ai/models");
  await expect(
    page.getByText("fixture-generation", { exact: true }),
  ).toBeVisible();
  await page.goto("/admin/ai/providers");
  await page
    .getByRole("button", { name: "اختبار النموذج فعلياً", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "نجح اختبار التوليد الفعلي" }),
  ).toBeVisible();
  await page.goto("/admin/authors");
  const writer = "كاتب الأتمتة " + info.project.name;
  await page.getByLabel("اسم الكاتب", { exact: true }).fill(writer);
  await page
    .getByLabel("الرابط الدائم", { exact: true })
    .fill("automation-author-" + info.project.name);
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: writer }).first(),
  ).toBeVisible();
  await page.goto("/admin/posts/new");
  await page
    .getByLabel("عنوان المسودة")
    .fill("المعرفة والقراءة " + info.project.name);
  await page.getByRole("button", { name: "إنشاء وفتح المحرر" }).click();
  await expect(page).toHaveURL(/\/edit$/);
  const id = page.url().split("/").at(-2)!;
  const slug = "automation-" + info.project.name;
  await page.getByLabel("الرابط الدائم", { exact: true }).fill(slug);
  await page
    .getByLabel("محتوى التدوينة")
    .fill(
      "القراءة توسع المعرفة وتمنح الإنسان فرصة لفهم العالم من خلال الكتب والتجارب الإنسانية.",
    );
  await page
    .getByRole("combobox", { name: "الكاتب", exact: true })
    .selectOption({ label: writer });
  await page.getByLabel("من بطون الكتب", { exact: true }).check();
  await page
    .getByRole("combobox", { name: "القسم الأساسي", exact: true })
    .selectOption({ label: "من بطون الكتب" });
  await expect(
    page.getByRole("status").filter({ hasText: "تم الحفظ" }),
  ).toBeVisible();
  // Private drafts are never available to the public assistant, even with an administrative cookie.
  const draft = await page.request.post("/api/v1/ai/summarize", {
    data: { post_id: id, type: "short" },
  });
  expect(draft.status()).toBe(404);
  await page.getByRole("button", { name: "نشر", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "منشورة" }),
  ).toBeVisible();
  await page.goto("/posts/" + slug);
  await page
    .getByRole("button", { name: "تلخيص بالذكاء الاصطناعي", exact: true })
    .click();
  const panel = page.locator("#ai-panel");
  await expect(
    panel.getByRole("button", { name: "تلخيص هذه التدوينة", exact: true }),
  ).toBeEnabled();
  await panel
    .getByRole("button", { name: "تلخيص هذه التدوينة", exact: true })
    .click();
  await expect(
    panel.getByRole("heading", { name: "المصادر المستخدمة" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("link", { name: new RegExp("المعرفة والقراءة") }),
  ).toHaveAttribute("href", "/posts/" + slug);
  await expect(panel).toContainText("القراءة توسع المعرفة");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("stage-4-assistant-fixture.png"),
    fullPage: false,
  });
  const cached = await page.request.post("/api/v1/ai/summarize", {
    data: { post_id: id, type: "short" },
  });
  expect(cached.status()).toBe(200);
  expect((await cached.json()).data.cached).toBe(true);
  const semantic = await page.request.post("/api/v1/ai/search", {
    data: { message: "القراءة" },
  });
  expect(semantic.status()).toBe(200);
  expect(
    (await semantic.json()).data.sources.some(
      (source: { post_id: string }) => source.post_id === id,
    ),
  ).toBe(true);
  await panel
    .getByRole("button", { name: "محادثة جديدة", exact: true })
    .click();
  await expect(
    panel.getByRole("heading", { name: "المصادر المستخدمة" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "إغلاق المساعد", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "فتح مساعد ما يسطرون", exact: true }),
  ).toBeFocused();
  await page.goto("/admin/ai/usage");
  await expect(
    page
      .locator(info.project.name === "mobile" ? ".data-records" : ".data-table")
      .getByText("fixture-generation")
      .first(),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("stage-4-admin-fixture.png"),
    fullPage: false,
  });
  // A correctly signed request works once. The same nonce is rejected by the database.
  const path = "/api/v1/internal/automation/health",
    body = "{}",
    time = String(Math.floor(Date.now() / 1000)),
    nonce = randomBytes(20).toString("hex");
  const signature = createHmac(
    "sha256",
    "fixture-only-gateway-secret-over-32-characters",
  )
    .update(
      [time, nonce, path, createHash("sha256").update(body).digest("hex")].join(
        "\n",
      ),
    )
    .digest("hex");
  const headers = {
    "Content-Type": "application/json",
    "x-maystroon-time": time,
    "x-maystroon-nonce": nonce,
    "x-maystroon-signature": signature,
  };
  expect(
    (await page.request.post(path, { headers, data: body })).status(),
  ).toBe(200);
  expect(
    (await page.request.post(path, { headers, data: body })).status(),
  ).toBe(409);
});
