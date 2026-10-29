// Real Auth, Storage and Next.js browser acceptance. Never accepts a remote target.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

export async function seedLocalBackup(status) {
  console.log(
    "Checking local API status fields and health before backup seed.",
  );
  if (!status.API_URL || !status.SERVICE_ROLE_KEY || !status.ANON_KEY)
    throw Error("Local CLI status lacks required API fields");
  if (new URL(status.API_URL).hostname !== "127.0.0.1")
    throw Error("Local API required");
  const health = await fetch(status.API_URL + "/auth/v1/health", {
    headers: { apikey: status.ANON_KEY },
    signal: AbortSignal.timeout(10000),
  });
  if (!health.ok)
    throw Error("Local Auth health check failed: " + health.status);
  const anonymous = createClient(status.API_URL, status.ANON_KEY, {
    auth: { persistSession: false },
  });
  const signup = await anonymous.auth.signUp({
    email: "signup-must-refuse@example.test",
    password: randomBytes(24).toString("base64url"),
  });
  if (signup.error?.code !== "signup_disabled")
    throw Error("Disposable configuration must keep public signup disabled");
  const email = "backup-local@example.test",
    password = randomBytes(24).toString("base64url");
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const user = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (user.error) throw Error("Local backup Auth seed failed");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6T1sAAAAASUVORK5CYII=",
    "base64",
  );
  if (
    (
      await admin.storage
        .from("editorial")
        .upload("backup-local.png", png, { contentType: "image/png" })
    ).error
  )
    throw Error("Local backup Storage seed failed");
  return { email, password };
}
export async function verifyLocalBackupLogin(status, credentials) {
  if (new URL(status.API_URL).hostname !== "127.0.0.1")
    throw Error("Local API required");
  const auth = createClient(status.API_URL, status.ANON_KEY, {
    auth: { persistSession: false },
  });
  const signedIn = await auth.auth.signInWithPassword(credentials);
  if (signedIn.error)
    throw Error(
      `Restored local Auth password verification failed (${signedIn.error.status || 0}/${signedIn.error.code || "transport"})`,
    );
  const identity = await auth.rpc("admin_identity");
  if (identity.error || identity.data?.active)
    throw Error("Unprivileged restored account unexpectedly became an admin");
  const denied = await auth.rpc("cms_save_post", {
    p_id: null,
    p_patch: { title: "must refuse" },
    p_expected_version: null,
  });
  if (!denied.error)
    throw Error("Unprivileged restored account could write a post");
  await auth.auth.signOut();
}

export async function dockerBrowser(status, grantUser) {
  if (new URL(status.API_URL).hostname !== "127.0.0.1")
    throw Error("Local API required");
  const email = `docker-${randomBytes(6).toString("hex")}@example.test`;
  const password = randomBytes(24).toString("base64url");
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw Error("Local Auth user creation failed");
  await grantUser(created.data.user.id);
  console.log(
    "Local Auth account provisioned. Building Next.js with isolated credentials.",
  );
  // Deliberately construct a new environment: production credentials never reach
  // Next.js, npm lifecycle scripts or browser subprocesses during restored-data tests.
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    CI: "true",
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    RATE_LIMIT_SECRET: randomBytes(32).toString("hex"),
    PIN_PEPPER: randomBytes(32).toString("hex"),
    AI_ENABLED: "false",
  };
  const build = spawnSync("npm", ["run", "build"], {
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (build.status !== 0)
    throw Error("Local Next.js build failed; output withheld");
  const boundary = spawnSync("npm", ["run", "security:client"], {
    env,
    encoding: "utf8",
  });
  if (boundary.status !== 0)
    throw Error("Local browser secret boundary check failed");
  const server = spawn(
    "npm",
    ["run", "start", "--", "--hostname", "127.0.0.1"],
    { env, stdio: "ignore", detached: true },
  );
  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        if ((await fetch("http://127.0.0.1:3000/api/v1/health")).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((done) => setTimeout(done, 1000));
    }
    if (!ready) throw Error("Local Next.js server not ready");
    browser = await chromium.launch({
      headless: true,
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    });
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.goto("/admin/login");
    await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(email);
    await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "تسجيل الدخول", exact: true })
      .click();
    await expect(page).toHaveURL(/admin\/dashboard/);
    console.log("Real Auth browser login passed; testing catalog and studio.");
    const headers = { origin: "http://127.0.0.1:3000" };
    const forbidden = await context.request.post("/api/v1/admin/posts", {
      headers: { origin: "https://forbidden.example" },
      data: { patch: { title: "refuse" } },
    });
    expect(forbidden.status()).toBe(403);
    const suffix = randomBytes(6).toString("hex");
    await page.goto("/admin/categories");
    await page
      .getByLabel("اسم القسم", { exact: true })
      .fill("قسم Docker " + suffix);
    await page
      .getByLabel("الرابط الدائم", { exact: true })
      .fill("docker-" + suffix);
    await page.getByLabel("لون القسم", { exact: true }).fill("#267E81");
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "قسم Docker " + suffix, exact: true }),
    ).toBeVisible();
    await page.goto("/admin/authors");
    await page
      .getByLabel("اسم الكاتب", { exact: true })
      .fill("كاتب Docker " + suffix);
    await page
      .getByLabel("الرابط الدائم", { exact: true })
      .fill("docker-" + suffix);
    await page.getByLabel("التخصص", { exact: true }).fill("أدب عربي");
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "كاتب Docker " + suffix, exact: true }),
    ).toBeVisible();
    await page.goto("/admin/posts/new");
    await page
      .getByLabel("عنوان المسودة", { exact: true })
      .fill("مقال Docker " + suffix);
    await page
      .getByRole("button", { name: "إنشاء وفتح المحرر", exact: true })
      .click();
    await expect(page).toHaveURL(/\/edit$/);
    await page
      .getByLabel("الرابط الدائم", { exact: true })
      .fill("docker-post-" + suffix);
    await page
      .locator(".tiptap")
      .fill("نص عربي محفوظ عبر Auth وPostgreSQL الحقيقيين.");
    await page
      .getByRole("combobox", { name: "الكاتب", exact: true })
      .selectOption({ label: "كاتب Docker " + suffix });
    await page.getByLabel("قسم Docker " + suffix, { exact: true }).check();
    await page
      .getByRole("combobox", { name: "القسم الأساسي", exact: true })
      .selectOption({ label: "قسم Docker " + suffix });
    await expect(
      page.getByRole("status").filter({ hasText: "تم الحفظ" }),
    ).toBeVisible();
    await page.reload();
    await expect(page.locator(".tiptap")).toContainText("نص عربي محفوظ");
    await page
      .getByRole("button", { name: "إرسال للمراجعة", exact: true })
      .click();
    await expect(page.locator(".studio-top [role=status]")).toContainText(
      "قيد المراجعة",
    );
    await page
      .getByRole("button", { name: "اعتماد النسخة الحالية", exact: true })
      .click();
    await expect(page.locator(".studio-top [role=status]")).toContainText(
      "معتمد تحريرياً",
    );
    await page.getByRole("button", { name: "نشر", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "منشورة" }),
    ).toBeVisible();
    await page.goto("/posts/docker-post-" + suffix);
    await expect(page.locator(".article-body")).toContainText("نص عربي محفوظ");
    console.log(
      "Catalog and editor persistence/publication passed; testing pages and sessions.",
    );
    const tags = await context.request.get("/api/v1/admin/tags");
    expect(tags.status()).toBe(200);
    await page.goto("/admin/reports");
    await expect(
      page.getByRole("heading", { name: "بلاغات التعليقات", exact: true }),
    ).toBeVisible();
    await page.goto("/admin/account/sessions");
    await expect(
      page.getByRole("heading", { name: "الجلسة الحالية", exact: true }),
    ).toBeVisible();
    await page.goto("/admin/pages");
    await page
      .getByLabel("عنوان الصفحة", { exact: true })
      .fill("صفحة Docker " + suffix);
    await page
      .getByLabel("رابط الصفحة", { exact: true })
      .fill("docker-page-" + suffix);
    await page.getByLabel("وصف الصفحة", { exact: true }).fill("وصف محفوظ");
    await page
      .getByLabel("محتوى الصفحة", { exact: true })
      .fill("نص الصفحة العربية");
    await page.getByRole("button", { name: "حفظ الصفحة", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("تم الحفظ.");
    await page.getByLabel("نشر الصفحة للعامة", { exact: true }).check();
    await page.getByRole("button", { name: "حفظ الصفحة", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("تم الحفظ.");
    await page.goto("/pages/docker-page-" + suffix);
    await expect(
      page.getByText("نص الصفحة العربية", { exact: true }),
    ).toBeVisible();
    await page.goto("/admin/pages");
    for (const width of [360, 390, 412, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    const unauth = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    expect(
      (
        await unauth.request.post("/api/v1/admin/posts", {
          headers,
          data: { patch: { title: "refuse" } },
        })
      ).status(),
    ).toBe(401);
    await unauth.close();
    // Real Storage API byte round-trip, isolated from all production buckets.
    const bucket = "docker-" + suffix;
    if ((await admin.storage.createBucket(bucket, { public: false })).error)
      throw Error("Local Storage bucket failed");
    const bytes = randomBytes(256);
    if ((await admin.storage.from(bucket).upload("roundtrip.bin", bytes)).error)
      throw Error("Local Storage upload failed");
    const downloaded = await admin.storage
      .from(bucket)
      .download("roundtrip.bin");
    if (
      downloaded.error ||
      !Buffer.from(await downloaded.data.arrayBuffer()).equals(bytes)
    )
      throw Error("Local Storage byte mismatch");
    await grantUser(created.data.user.id, false);
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/admin\/login/);
    console.log(
      "Real Docker browser: login, session, catalog, editor/reload/publish, tags/reports, pages, five widths, authorization and Storage passed.",
    );
  } catch (error) {
    if (process.argv[2] === "local")
      console.error(
        error.message
          .replaceAll(password, "[local password omitted]")
          .replace(/eyJ[A-Za-z0-9_.-]+/g, "[local JWT omitted]"),
      );
    throw Error("Real Docker browser acceptance failed");
  } finally {
    await browser?.close();
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
  }
}
