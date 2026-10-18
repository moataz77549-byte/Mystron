import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const controls = vi.hoisted(() => ({ configured: true, allowed: true }));
vi.mock("../src/lib/env", () => ({
  databaseConfigured: () => controls.configured,
}));
vi.mock("../src/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => controls.allowed),
}));
vi.mock("../src/lib/content", () => ({
  posts: vi.fn(async (params) => {
    const { querySchema } = await import("../src/lib/validation");
    const p = querySchema.parse(params);
    return { data: [], total: 0, ...p };
  }),
  post: vi.fn(async () => null),
  categories: vi.fn(async () => []),
  publicSettings: vi.fn(async () => []),
}));
import { GET as list } from "../src/app/api/v1/posts/route";
import { GET as article } from "../src/app/api/v1/posts/[slug]/route";
import { GET as settings } from "../src/app/api/v1/site/settings/route";
beforeEach(() => {
  controls.configured = true;
  controls.allowed = true;
});
describe("public API contract", () => {
  it("returns empty collection with pagination rather than fabricated posts", async () => {
    const r = await list(
      new NextRequest("http://localhost:3000/api/v1/posts?page=2"),
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ data: [], page: 2, total: 0 });
  });
  it("rejects invalid query with safe error", async () => {
    const r = await list(
      new NextRequest("http://localhost:3000/api/v1/posts?pageSize=999"),
    );
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: { code: "INVALID_QUERY" } });
  });
  it("returns 404 for unavailable slug", async () => {
    const r = await article(
      new NextRequest("http://localhost:3000/api/v1/posts/draft"),
      { params: Promise.resolve({ slug: "draft" }) },
    );
    expect(r.status).toBe(404);
  });
  it("fails closed on absent database and exhausted limit", async () => {
    controls.configured = false;
    expect(
      (
        await settings(
          new NextRequest("http://localhost:3000/api/v1/site/settings"),
        )
      ).status,
    ).toBe(503);
    controls.configured = true;
    controls.allowed = false;
    expect(
      (await list(new NextRequest("http://localhost:3000/api/v1/posts")))
        .status,
    ).toBe(429);
  });
});
