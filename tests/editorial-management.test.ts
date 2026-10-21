import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  identity: true,
  permissions: {} as Record<string, string>,
  rpc: vi.fn(),
  limit: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("../src/lib/auth", () => ({
  authorizedUser: async () =>
    state.identity
      ? {
          user: { id: "fixture" },
          permissions: state.permissions,
          db: { rpc: state.rpc },
        }
      : null,
}));
vi.mock("../src/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => state.limit(...args),
}));
vi.mock("../src/lib/origin", () => ({
  sameOrigin: (req: NextRequest) =>
    req.headers.get("origin") === "https://fixture.test",
}));
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => state.revalidate(...args),
}));
import {
  GET as listTags,
  POST as mergeTag,
} from "../src/app/api/v1/admin/tags/route";
import { POST as resolveReport } from "../src/app/api/v1/admin/reports/route";
function req(body: unknown, origin = "https://fixture.test") {
  return new NextRequest("https://fixture.test/api/v1/admin/tags", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  state.identity = true;
  state.permissions = {
    "posts.read": "all",
    "posts.update": "all",
    "comments.moderate": "all",
  };
  state.limit.mockResolvedValue(true);
  state.rpc.mockResolvedValue({ data: { updated: 2 }, error: null });
});
it("checks server permission and origin before mutating tags or reports", async () => {
  expect((await mergeTag(req({}, "https://evil.test"))).status).toBe(403);
  state.identity = false;
  expect(
    (await listTags(new NextRequest("https://fixture.test/api/v1/admin/tags")))
      .status,
  ).toBe(401);
  state.identity = true;
  state.permissions = {};
  expect((await mergeTag(req({}))).status).toBe(403);
  expect((await resolveReport(req({}))).status).toBe(403);
  expect(state.rpc).not.toHaveBeenCalled();
});
it("validates tag changes and invalidates caches only after a confirmed SQL commit", async () => {
  const body = { source: "قديم", target: "نهائي", expected_count: 2 };
  expect((await mergeTag(req({ ...body, arbitrary: true }))).status).toBe(400);
  state.rpc.mockResolvedValue({
    error: { code: "40001", message: "VERSION_CONFLICT" },
  });
  expect((await mergeTag(req(body))).status).toBe(409);
  expect(state.revalidate).not.toHaveBeenCalled();
  state.rpc.mockResolvedValue({ data: { updated: 2 }, error: null });
  expect((await mergeTag(req(body))).status).toBe(200);
  expect(state.rpc).toHaveBeenLastCalledWith("cms_merge_tag", {
    p_source: "قديم",
    p_target: "نهائي",
    p_expected_count: 2,
  });
  expect(state.revalidate).toHaveBeenCalledWith("/", "layout");
});
it("bounds queries and preserves throttling metadata", async () => {
  expect(
    (
      await listTags(
        new NextRequest("https://fixture.test/api/v1/admin/tags?page=0"),
      )
    ).status,
  ).toBe(400);
  state.limit.mockResolvedValue(false);
  const response = await mergeTag(
    req({ source: "قديم", target: "نهائي", expected_count: 2 }),
  );
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("60");
});
it("keeps report actions narrow and masks database diagnostics", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  expect((await resolveReport(req({ id, action: "delete-user" }))).status).toBe(
    400,
  );
  state.rpc.mockResolvedValue({
    error: { code: "42501", message: "FORBIDDEN private visitor detail" },
  });
  const response = await resolveReport(req({ id, action: "hidden" }));
  expect(response.status).toBe(403);
  expect(await response.text()).not.toContain("visitor");
  state.rpc.mockResolvedValue({ data: { resolved: true }, error: null });
  expect((await resolveReport(req({ id, action: "dismissed" }))).status).toBe(
    200,
  );
});
