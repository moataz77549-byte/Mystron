import { defineConfig, devices } from "@playwright/test";
if (!process.env.LIVE_SITE_URL)
  throw new Error(
    "Set LIVE_SITE_URL to the approved HTTPS preview or production origin.",
  );
const target = new URL(process.env.LIVE_SITE_URL);
if (
  target.protocol !== "https:" ||
  target.username ||
  target.password ||
  target.pathname !== "/" ||
  target.search ||
  target.hash
)
  throw new Error(
    "LIVE_SITE_URL must be an HTTPS origin without credentials, path, query or fragment.",
  );
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "live-database.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 45000,
  use: { baseURL: target.origin, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
