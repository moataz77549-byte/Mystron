import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  authenticated: true,
  rpc: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("../src/lib/auth", () => ({
  authorizedUser: async () =>
    state.authenticated
      ? { user: { id: "fixture-user" }, db: { rpc: state.rpc } }
      : null,
}));
vi.mock("../src/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => state.limit(...args),
}));
vi.mock("../src/lib/origin", () => ({
  sameOrigin: (request: NextRequest) =>
    request.headers.get("origin") === "https://fixture.test",
}));
import { GET, POST } from "../src/app/api/v1/admin/account/sessions/route";
const id = "55555555-5555-4555-8555-555555555555";
function request(body: unknown, origin = "https://fixture.test") {
  return new NextRequest("https://fixture.test/api/v1/admin/account/sessions", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  state.authenticated = true;
  state.rpc.mockResolvedValue({ data: { revoked: true }, error: null });
  state.limit.mockResolvedValue(true);
});
it("requires a current authenticated account and rejects cross-origin mutation", async () => {
  expect((await POST(request({ id }, "https://evil.test"))).status).toBe(403);
  state.authenticated = false;
  expect((await POST(request({ id }))).status).toBe(401);
  expect(
    (
      await GET(
        new NextRequest("https://fixture.test/api/v1/admin/account/sessions"),
      )
    ).status,
  ).toBe(401);
  expect(state.rpc).not.toHaveBeenCalled();
});
it("cannot supply a target user or invalid page and preserves rate-limit headers", async () => {
  expect((await POST(request({ id, user_id: "another-user" }))).status).toBe(
    400,
  );
  expect(
    (
      await GET(
        new NextRequest(
          "https://fixture.test/api/v1/admin/account/sessions?page=0",
        ),
      )
    ).status,
  ).toBe(400);
  state.limit.mockResolvedValue(false);
  const response = await POST(request({ id }));
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("60");
});
it("forwards only the session identifier, masks diagnostics, and keeps reads uncached", async () => {
  expect((await POST(request({ id }))).status).toBe(200);
  expect(state.rpc).toHaveBeenCalledWith("admin_revoke_my_session", {
    p_session: id,
  });
  state.rpc.mockResolvedValue({
    error: { message: "NOT_FOUND private other-user details" },
  });
  const response = await POST(request({ id }));
  expect(response.status).toBe(404);
  expect(await response.text()).not.toContain("private");
  state.rpc.mockResolvedValue({
    data: { rows: [], total: 0, page: 2, page_size: 25 },
    error: null,
  });
  const result = await GET(
    new NextRequest(
      "https://fixture.test/api/v1/admin/account/sessions?page=2",
    ),
  );
  expect(result.headers.get("Cache-Control")).toContain("no-store");
  expect(state.rpc).toHaveBeenLastCalledWith("admin_my_sessions", {
    p_page: 2,
  });
});
