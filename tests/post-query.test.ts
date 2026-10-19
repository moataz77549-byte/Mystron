import { expect, it } from "vitest";
import {
  postListArguments,
  postQuerySchema,
} from "../src/lib/editorial/post-query";
import { permittedNavigation } from "../src/lib/control/navigation-schema";
it("validates editorial filters and bounds pagination before invoking SQL", () => {
  const query = postQuerySchema.parse({
    q: "إبداع",
    status: "review",
    page: "2",
    page_size: "50",
  });
  expect(postListArguments(query)).toMatchObject({
    p_page: 2,
    p_q: "إبداع",
    p_status: "review",
    p_filters: { page_size: 50, sort: "updated" },
  });
  expect(postQuerySchema.safeParse({ page_size: 10000 }).success).toBe(false);
  expect(
    postQuerySchema.safeParse({ from: "2026-12-20", to: "2026-01-01" }).success,
  ).toBe(false);
  expect(postQuerySchema.safeParse({ author_id: "untrusted" }).success).toBe(
    false,
  );
  expect(postQuerySchema.safeParse({ status: "APPROVED" }).success).toBe(false);
});
it("navigation excludes unauthorized groups and searches only permitted links", () => {
  const navigation = permittedNavigation(["posts.read", "posts.create"]);
  expect(
    navigation.flatMap((g) => g.links).some((l) => l.path === "posts/new"),
  ).toBe(true);
  expect(
    navigation.flatMap((g) => g.links).some((l) => l.path === "users"),
  ).toBe(false);
  expect(permittedNavigation(["posts.read"], "المشرفون")).toEqual([]);
  expect(permittedNavigation(["posts.read"], "المسودات")[0].links[0].path).toBe(
    "posts?status=draft",
  );
});
