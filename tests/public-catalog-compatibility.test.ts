import { vi as cacheMock } from "vitest";
cacheMock.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
import { expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
const state = vi.hoisted(() => ({ calls: [] as URL[] }));
vi.mock("../src/lib/supabase", () => ({
  publicDatabase: () =>
    createClient("https://catalog-fixture.invalid", "fixture-publishable-key", {
      auth: { persistSession: false },
      global: {
        fetch: async (input) => {
          const url = new URL(String(input));
          state.calls.push(url);
          const field = url.pathname.endsWith("categories")
            ? "color"
            : "specialty";
          if (url.searchParams.get("select")?.split(",").includes(field))
            return Response.json(
              { code: "42703", message: `column ${field} does not exist` },
              { status: 400 },
            );
          return Response.json([], { status: 200 });
        },
      },
    }),
}));
import { categories } from "../src/lib/content";
import { publicAuthor, publicAuthors } from "../src/lib/public-catalog";
it("real Supabase requests retain visibility filters and pagination while reading the legacy schema", async () => {
  expect(await categories()).toEqual([]);
  expect(await publicAuthors(2, 25)).toEqual([]);
  expect(await publicAuthor("writer")).toBeNull();
  expect(state.calls).toHaveLength(6);
  for (const url of state.calls) {
    expect(url.searchParams.get("is_active")).toBe("eq.true");
    expect(url.searchParams.get("deleted_at")).toBe("is.null");
    expect(url.searchParams.get("select")).not.toContain("created_by");
  }
  expect(state.calls[3].searchParams.get("offset")).toBe("25");
  expect(state.calls[3].searchParams.get("limit")).toBe("25");
  expect(state.calls[5].searchParams.get("slug")).toBe("eq.writer");
});
