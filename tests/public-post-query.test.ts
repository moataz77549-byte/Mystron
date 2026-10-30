import { beforeEach, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  calls: [] as URL[],
  categoryStatus: 200,
  missing: false,
}));
vi.mock("../src/lib/env", () => ({ databaseConfigured: () => true }));
vi.mock("../src/lib/rate-limit", () => ({ rateLimit: async () => true }));
vi.mock("../src/lib/supabase", () => ({
  publicDatabase: () =>
    createClient("https://post-fixture.invalid", "fixture-public-key", {
      auth: { persistSession: false },
      global: {
        fetch: async (input) => {
          const url = new URL(String(input));
          state.calls.push(url);
          if (url.pathname.endsWith("/categories")) {
            if (state.categoryStatus !== 200)
              return Response.json(
                { code: "42501", message: "Internal database detail" },
                { status: state.categoryStatus },
              );
            return Response.json(
              state.missing
                ? []
                : [{ id: "11111111-1111-4111-8111-111111111111" }],
            );
          }
          return Response.json([{ id: "post-after-first-thousand" }], {
            headers: { "Content-Range": "1000-1000/1001" },
          });
        },
      },
    }),
}));
import { GET } from "../src/app/api/v1/posts/route";
beforeEach(() => {
  state.calls = [];
  state.categoryStatus = 200;
  state.missing = false;
});
const request = () =>
  new NextRequest(
    "https://example.org/api/v1/posts?category=أدب&page=21&pageSize=50",
  );
it("applies category and pagination in one counted post query without truncating link IDs", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    total: 1001,
    page: 21,
    pageSize: 50,
    data: [{ id: "post-after-first-thousand" }],
  });
  expect(state.calls).toHaveLength(2);
  const [category, posts] = state.calls;
  expect(category.searchParams.get("is_active")).toBe("eq.true");
  expect(category.searchParams.get("deleted_at")).toBe("is.null");
  expect(posts.pathname).toBe("/rest/v1/posts");
  expect(posts.searchParams.get("select")).toContain("post_categories!inner()");
  expect(posts.searchParams.get("post_categories.category_id")).toBe(
    "eq.11111111-1111-4111-8111-111111111111",
  );
  expect(posts.searchParams.has("id")).toBe(false);
  expect(posts.searchParams.get("offset")).toBe("1000");
  expect(posts.searchParams.get("limit")).toBe("50");
  expect(posts.searchParams.get("status")).toBe("eq.published");
  expect(posts.searchParams.get("visibility")).toBe("eq.public");
});
it("returns a sanitized service error instead of an empty success on category database failures", async () => {
  state.categoryStatus = 403;
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: { code: "SERVICE_UNAVAILABLE" },
  });
  expect(state.calls).toHaveLength(1);
});
it("keeps nonexistent or hidden categories empty without querying posts", async () => {
  state.missing = true;
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ data: [], total: 0 });
  expect(state.calls).toHaveLength(1);
});
