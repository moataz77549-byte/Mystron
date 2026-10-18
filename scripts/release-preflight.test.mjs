import { test } from "node:test";
import assert from "node:assert/strict";
import { releaseIssues } from "./release-preflight.mjs";

const configured = {
  NEXT_PUBLIC_SITE_URL: "https://example.org",
  NEXT_PUBLIC_SUPABASE_URL: "https://database.example.org",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-test-key",
  SUPABASE_SERVICE_ROLE_KEY: "private-test-key",
  PIN_PEPPER: "p".repeat(64),
  RATE_LIMIT_SECRET: "r".repeat(64),
  AI_ENABLED: "false",
};
test("release remains usable with AI disabled and Telegram optional", () => {
  assert.deepEqual(releaseIssues(configured), []);
  assert.ok(releaseIssues({}, false).length > 0);
});
test("rejects unsafe origins, fixtures and accidental AI activation", () => {
  for (const origin of [
    "http://example.org",
    "https://localhost",
    "https://user:secret@example.org",
    "https://example.org/path",
    "https://example.org?secret=value",
  ]) {
    assert.ok(
      releaseIssues({ ...configured, NEXT_PUBLIC_SITE_URL: origin }).some((x) =>
        x.startsWith("NEXT_PUBLIC_SITE_URL:"),
      ),
    );
  }
  for (const change of [
    { AI_ENABLED: "true" },
    { AI_API_KEY: "sensitive-provider-value" },
    { MAYSTROON_TEST_FIXTURE: "true" },
    { AI_ALLOW_TEST_HTTP: "true" },
    { PIN_PEPPER: configured.RATE_LIMIT_SECRET },
  ]) {
    const errors = releaseIssues({ ...configured, ...change });
    assert.ok(errors.length);
    assert.ok(!errors.join().includes("sensitive-provider-value"));
  }
});
test("Telegram requires independent secrets, a real token format and HTTPS webhook", () => {
  assert.ok(releaseIssues(configured, true).length);
  const telegram = {
    ...configured,
    TELEGRAM_BOT_TOKEN: "123456:" + "t".repeat(35),
    TELEGRAM_GATEWAY_SECRET: "g".repeat(64),
    TELEGRAM_WEBHOOK_SECRET: "w".repeat(64),
    TELEGRAM_WEBHOOK_URL: "https://bot.example.org/webhook",
  };
  assert.deepEqual(releaseIssues(telegram, true), []);
  assert.ok(
    releaseIssues(
      { ...telegram, TELEGRAM_WEBHOOK_URL: "https://bot.example.org/" },
      true,
    ).length,
  );
});
