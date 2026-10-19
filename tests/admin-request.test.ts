import { afterEach, expect, it, vi } from "vitest";
import {
  adminErrorMessage,
  adminRequest,
  AdminRequestError,
  retrySeconds,
} from "../src/lib/client/request";
afterEach(() => vi.unstubAllGlobals());
it("preserves HTTP status and cooldown and translates actionable Arabic errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "RATE_LIMITED" } }), {
        status: 429,
        headers: { "Retry-After": "42" },
      }),
    ),
  );
  const error = await adminRequest("/fixture").catch((e: unknown) => e);
  expect(error).toMatchObject({
    status: 429,
    retryAfter: 42,
    code: "RATE_LIMITED",
  });
  expect(adminErrorMessage(error)).toContain("تجاوزت عدد المحاولات");
  expect(
    adminErrorMessage(new AdminRequestError("UNAUTHORIZED", 401)),
  ).toContain("انتهت الجلسة");
  expect(
    adminErrorMessage(new AdminRequestError("TELEGRAM_UNCONFIGURED", 503)),
  ).toContain("إعدادات البوت");
});
it("handles HTTP-date Retry-After, malformed headers and non-JSON proxy errors", async () => {
  expect(
    retrySeconds(
      "Mon, 19 Oct 2026 12:00:30 GMT",
      Date.parse("2026-10-19T12:00:00Z"),
    ),
  ).toBe(30);
  expect(retrySeconds("invalid")).toBe(0);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("upstream credentials must not be shown", { status: 502 }),
      ),
  );
  await expect(adminRequest("/fixture")).rejects.toMatchObject({
    code: "REQUEST_FAILED",
    status: 502,
  });
});
it("differentiates aborts and network failures", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("private transport diagnostic")),
  );
  await expect(adminRequest("/fixture")).rejects.toMatchObject({
    code: "NETWORK_ERROR",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")),
  );
  await expect(adminRequest("/fixture")).rejects.toMatchObject({
    name: "AbortError",
  });
});
