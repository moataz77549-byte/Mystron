import { defineConfig, devices } from "@playwright/test";
const env = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54331",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "fixture-service-role",
  RATE_LIMIT_SECRET: "fixture-only-rate-limit-secret-32-characters",
  NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
  PIN_PEPPER: "fixture-only-pin-pepper-more-than-32-characters",
  MAYSTROON_TEST_FIXTURE: "true",
  AI_ALLOW_TEST_HTTP: "true",
  AI_ENABLED: "true",
  AI_BASE_URL: "http://127.0.0.1:54332/v1",
  AI_API_KEY: "fixture-only-ai-key",
  AI_MODEL: "fixture-generation",
  AI_EMBEDDING_MODEL: "fixture-embedding",
  AI_STREAMING_SUPPORTED: "true",
  TELEGRAM_GATEWAY_SECRET: "fixture-only-gateway-secret-over-32-characters",
  CRON_SECRET: "fixture-only-cron-secret-32-characters",
};
export default defineConfig({
  testDir: "./tests/cms-e2e",
  workers: 1,
  timeout: 180000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--use-gl=angle",
            "--use-angle=swiftshader",
          ],
        }
      : {},
  },
  webServer: [
    {
      command: "node tests/support/ai-provider-fixture.mjs",
      url: "http://127.0.0.1:54332/health",
      reuseExistingServer: false,
    },
    {
      command: "node tests/support/supabase-fixture.mjs",
      url: "http://127.0.0.1:54331/health",
      reuseExistingServer: false,
    },
    {
      command:
        "npm run build && npm run security:client && npm run start -- --hostname 127.0.0.1",
      url: "http://127.0.0.1:3000",
      env,
      timeout: 120000,
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        extraHTTPHeaders: { "x-vercel-forwarded-for": "192.0.2.10" },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        extraHTTPHeaders: { "x-vercel-forwarded-for": "192.0.2.20" },
      },
    },
  ],
});
