import { it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/rate-limit", () => ({ rateLimit: async () => true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const state = vi.hoisted(() => ({
  signedIn: false,
  args: null as unknown,
  rpc: vi.fn(),
}));
vi.mock("../src/lib/auth", () => ({
  authorizedUser: async () =>
    state.signedIn
      ? {
          user: { id: "11111111-1111-4111-8111-111111111111" },
          roles: ["OWNER"],
          db: { rpc: state.rpc },
        }
      : null,
}));
vi.mock("../src/lib/origin", () => ({
  sameOrigin: (req: NextRequest) =>
    req.headers.get("origin") === "https://fixture.example.test",
}));
import { POST } from "../src/app/api/v1/admin/[resource]/route";
beforeEach(() => {
  state.signedIn = false;
  state.args = null;
  state.rpc.mockReset();
  state.rpc.mockImplementation(async (_name, args) => {
    state.args = args;
    return {
      data: { id: "11111111-1111-4111-8111-111111111111", version: 2 },
      error: null,
    };
  });
});
function req(body: unknown, origin = "https://fixture.example.test") {
  return new NextRequest("https://fixture.example.test/api/v1/admin/posts", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
it("admin API rejects cross-origin and unauthenticated direct mutations", async () => {
  expect(
    (
      await POST(req({}, "https://attacker.test"), {
        params: Promise.resolve({ resource: "posts" }),
      })
    ).status,
  ).toBe(403);
  expect(
    (await POST(req({}), { params: Promise.resolve({ resource: "posts" }) }))
      .status,
  ).toBe(401);
  expect(state.rpc).not.toHaveBeenCalled();
});
it("rejects mass assignment and renders sanitized JSON before invoking narrow RPC", async () => {
  state.signedIn = true;
  expect(
    (
      await POST(
        req({ patch: { title: "عنوان", slug: "valid", status: "published" } }),
        { params: Promise.resolve({ resource: "posts" }) },
      )
    ).status,
  ).toBe(400);
  const r = await POST(
    req({
      patch: {
        title: "عنوان",
        slug: "valid",
        content_json: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "<script>bad</script>" }],
            },
          ],
        },
      },
    }),
    { params: Promise.resolve({ resource: "posts" }) },
  );
  expect(r.status).toBe(200);
  expect(state.args).toMatchObject({
    p_patch: {
      content: "<script>bad</script>",
      content_html: expect.stringContaining("&lt;script&gt;"),
    },
  });
});
it("returns reviewable 409 conflict without database internals", async () => {
  state.signedIn = true;
  state.rpc.mockResolvedValue({
    data: null,
    error: { message: "VERSION_CONFLICT private implementation detail" },
  });
  const r = await POST(
    req({
      id: "11111111-1111-4111-8111-111111111111",
      version: 2,
      patch: { title: "عنوان", slug: "valid" },
    }),
    { params: Promise.resolve({ resource: "posts" }) },
  );
  expect(r.status).toBe(409);
  expect(await r.json()).toEqual({ error: { code: "VERSION_CONFLICT" } });
});

it("validates category colors and author specialties before forwarding metadata to the existing RPCs", async () => {
  state.signedIn = true;
  const result = await POST(
    req({ patch: { name: "قسم", slug: "category", color: "#C77955" } }),
    { params: Promise.resolve({ resource: "categories" }) },
  );
  expect(result.status).toBe(200);
  expect(state.rpc).toHaveBeenLastCalledWith(
    "cms_save_category",
    expect.objectContaining({
      p_patch: { name: "قسم", slug: "category", color: "#C77955" },
    }),
  );
  const unsafe = await POST(
    req({
      patch: {
        name: "قسم",
        slug: "category",
        color: "url(https://example.test)",
      },
    }),
    { params: Promise.resolve({ resource: "categories" }) },
  );
  expect(unsafe.status).toBe(400);
  const specialty = await POST(
    req({
      patch: { display_name: "كاتب", slug: "author", specialty: "الأدب" },
    }),
    { params: Promise.resolve({ resource: "authors" }) },
  );
  expect(specialty.status).toBe(200);
  expect(state.rpc).toHaveBeenLastCalledWith(
    "cms_save_author",
    expect.objectContaining({
      p_patch: { display_name: "كاتب", slug: "author", specialty: "الأدب" },
    }),
  );
  const tooLong = await POST(
    req({
      patch: {
        display_name: "كاتب",
        slug: "author",
        specialty: "x".repeat(201),
      },
    }),
    { params: Promise.resolve({ resource: "authors" }) },
  );
  expect(tooLong.status).toBe(400);
});
it("routes approval through the existing transition and preserves review errors", async () => {
  state.signedIn = true;
  const body = {
    id: "11111111-1111-4111-8111-111111111111",
    version: 2,
    action: "approve",
  };
  expect(
    (
      await POST(req(body), {
        params: Promise.resolve({ resource: "transitions" }),
      })
    ).status,
  ).toBe(200);
  expect(state.rpc).toHaveBeenCalledWith(
    "cms_transition_post",
    expect.objectContaining({ p_action: "approve", p_expected_version: 2 }),
  );
  state.rpc.mockResolvedValue({
    data: null,
    error: { message: "APPROVAL_REQUIRES_REVIEW internal details" },
  });
  const rejected = await POST(req(body), {
    params: Promise.resolve({ resource: "transitions" }),
  });
  expect(await rejected.json()).toEqual({
    error: { code: "APPROVAL_REQUIRES_REVIEW" },
  });
});
it("static page writes reject unknown fields and invalid document nodes", async () => {
  state.signedIn = true;
  const patch = {
    title: "صفحة",
    slug: "about",
    description: "",
    is_published: false,
    content_json: { type: "doc", content: [{ type: "paragraph" }] },
  };
  expect(
    (
      await POST(req({ patch: { ...patch, updated_by: "someone" } }), {
        params: Promise.resolve({ resource: "pages" }),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        req({ patch: { ...patch, content_json: { type: "script" } } }),
        { params: Promise.resolve({ resource: "pages" }) },
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(req({ patch }), {
        params: Promise.resolve({ resource: "pages" }),
      })
    ).status,
  ).toBe(200);
  expect(state.rpc).toHaveBeenCalledWith(
    "cms_save_page",
    expect.objectContaining({ p_id: null, p_patch: patch }),
  );
});
