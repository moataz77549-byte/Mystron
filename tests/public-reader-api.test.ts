import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fixture from "../packages/contracts/fixtures/public-reader-page.json";
import { publicPostPageDto } from "../packages/contracts/public-reader";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
const state = vi.hoisted(() => ({ allowed: true }));
vi.mock("../src/lib/env", () => ({ databaseConfigured: () => true }));
vi.mock("../src/lib/rate-limit", () => ({
  rateLimit: async () => state.allowed,
}));
vi.mock("../src/lib/control/navigation", () => ({
  publicMenus: async () => [],
}));
vi.mock("../src/lib/content", () => ({
  homeData: vi.fn(),
  featuredPost: vi.fn(),
  popularPosts: vi.fn(),
  categories: vi.fn(),
  post: vi.fn(),
  posts: vi.fn(),
}));
import * as content from "../src/lib/content";
import { GET as home } from "../src/app/api/v1/home/route";
import { GET as category } from "../src/app/api/v1/categories/[slug]/route";
import { GET as authorPosts } from "../src/app/api/v1/authors/[slug]/posts/route";
import { GET as related } from "../src/app/api/v1/posts/[slug]/related/route";
beforeEach(() => {
  vi.resetAllMocks();
  state.allowed = true;
});
const request = (path: string) =>
  new NextRequest("https://example.org/api/v1/" + path);
it("shares the public page shape with Kotlin without exposing editorial credentials", () => {
  expect(publicPostPageDto.parse(fixture).data[0].title).toBe(
    fixture.data[0].title,
  );
  expect(
    publicPostPageDto.safeParse({ ...fixture, pageSize: 51 }).success,
  ).toBe(false);
  expect(
    publicPostPageDto.safeParse({
      ...fixture,
      data: [{ ...fixture.data[0], published_at: "invalid" }],
    }).success,
  ).toBe(false);
  expect(JSON.stringify(fixture)).not.toMatch(
    /service_role|password|pin_hash|telegram_id/,
  );
});
it("uses the existing home services and returns a real empty home", async () => {
  vi.mocked(content.homeData).mockResolvedValue({
    categories: [],
    posts: [],
    ticker: [],
    state: "ready",
  });
  vi.mocked(content.featuredPost).mockResolvedValue(null);
  vi.mocked(content.popularPosts).mockResolvedValue([]);
  const response = await home(request("home"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    data: {
      categories: [],
      posts: [],
      ticker: [],
      state: "ready",
      featured: null,
      popular: [],
    },
  });
  vi.mocked(content.homeData).mockResolvedValue({
    categories: [],
    posts: [],
    ticker: [],
    state: "error",
  });
  expect((await home(request("home"))).status).toBe(503);
});
it("does not expose unavailable categories or related articles for hidden posts", async () => {
  vi.mocked(content.categories).mockResolvedValue([]);
  expect(
    (
      await category(request("categories/hidden"), {
        params: Promise.resolve({ slug: "hidden" }),
      })
    ).status,
  ).toBe(404);
  vi.mocked(content.post).mockResolvedValue(null);
  expect(
    (
      await related(request("posts/draft/related"), {
        params: Promise.resolve({ slug: "draft" }),
      })
    ).status,
  ).toBe(404);
  expect(content.posts).not.toHaveBeenCalled();
});
it("takes the author from the path and retains public pagination", async () => {
  vi.mocked(content.posts).mockResolvedValue({
    data: [],
    total: 0,
    page: 2,
    pageSize: 12,
    sort: "newest",
  });
  expect(
    (
      await authorPosts(request("authors/actual/posts?author=spoofed&page=2"), {
        params: Promise.resolve({ slug: "actual" }),
      })
    ).status,
  ).toBe(200);
  expect(content.posts).toHaveBeenCalledWith({ author: "actual", page: "2" });
});
it("returns a retry duration when the public limiter rejects a mobile read", async () => {
  state.allowed = false;
  const response = await home(request("home"));
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("60");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(content.homeData).not.toHaveBeenCalled();
});
