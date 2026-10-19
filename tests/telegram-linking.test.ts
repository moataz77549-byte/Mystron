import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  authenticated: true,
  rpc: vi.fn(),
  read: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("../src/lib/auth", () => ({
  authorizedUser: async () =>
    state.authenticated
      ? {
          user: { id: "11111111-1111-4111-8111-111111111111" },
          db: {
            rpc: state.rpc,
            from: () => ({
              select: () => ({ eq: () => ({ maybeSingle: state.read }) }),
            }),
          },
        }
      : null,
}));
vi.mock("../src/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => state.limit(...args),
}));
vi.mock("../src/lib/origin", () => ({
  sameOrigin: (r: NextRequest) =>
    r.headers.get("origin") === "https://fixture.example.test",
}));
import { GET, POST } from "../src/app/api/v1/admin/telegram/route";
function request(
  action: unknown = "link",
  origin = "https://fixture.example.test",
) {
  return new NextRequest("https://fixture.example.test/api/v1/admin/telegram", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}
beforeEach(() => {
  state.authenticated = true;
  state.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  state.read.mockReset().mockResolvedValue({ data: null, error: null });
  state.limit.mockReset().mockResolvedValue(true);
  vi.stubEnv("TELEGRAM_BOT_USERNAME", "MaystroonFixtureBot");
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "fixture-token-only");
  vi.stubEnv("TELEGRAM_GATEWAY_SECRET", "g".repeat(40));
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "w".repeat(40));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("authenticated Telegram account linking", () => {
  it("rejects unauthenticated and cross-origin calls before RPC or limiter", async () => {
    expect((await POST(request("link", "https://attacker.test"))).status).toBe(
      403,
    );
    state.authenticated = false;
    expect((await GET()).status).toBe(401);
    expect((await POST(request())).status).toBe(401);
    expect(state.limit).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("returns a one-use link but stores only its SHA-256 hash", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const result = (await response.json()).data;
    const url = new URL(result.url),
      token = url.searchParams.get("start")!;
    expect(url.origin).toBe("https://t.me");
    expect(url.pathname).toBe("/MaystroonFixtureBot");
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(state.rpc).toHaveBeenCalledWith("telegram_create_link", {
      p_hash: createHash("sha256").update(token).digest("hex"),
    });
    expect(JSON.stringify(state.rpc.mock.calls)).not.toContain(token);
    expect(result.expires_in).toBe(300);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
  it("provides Retry-After on 429 and never creates a token", async () => {
    state.limit.mockResolvedValue(false);
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("300");
    expect(await response.json()).toEqual({ error: { code: "RATE_LIMITED" } });
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("does not consume retries when configuration or input is invalid", async () => {
    expect((await POST(request("mass-assignment"))).status).toBe(400);
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "invalid/url");
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "TELEGRAM_UNCONFIGURED" },
    });
    expect(state.limit).not.toHaveBeenCalled();
  });
  it("allows revocation when bot configuration is absent with a separate quota", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    expect((await POST(request("unlink"))).status).toBe(200);
    expect(state.limit.mock.calls[0][0]).toContain("telegram-unlink:");
    expect(state.rpc).toHaveBeenCalledWith("telegram_unlink");
  });
  it("distinguishes RPC infrastructure errors from forbidden access without leaking details", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.rpc.mockResolvedValue({
      error: { code: "PGRST202", message: "private secret diagnostic" },
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private secret");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private secret");
    state.rpc.mockResolvedValue({
      error: { code: "42501", message: "FORBIDDEN" },
    });
    expect((await POST(request())).status).toBe(403);
  });
  it("returns only the current user's persisted link and no pending token", async () => {
    state.read.mockResolvedValue({
      data: {
        telegram_id: 12345,
        enabled: true,
        linked_at: "2026-10-19T00:00:00Z",
      },
      error: null,
    });
    const response = await GET();
    const body = await response.json();
    expect(body.data.link.enabled).toBe(true);
    expect(body.data.configured).toBe(true);
    expect(JSON.stringify(body)).not.toContain("p_hash");
  });
});
