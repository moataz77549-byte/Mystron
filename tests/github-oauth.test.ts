import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  configured: true,
  db: vi.fn(),
}));
vi.mock("../src/lib/env", () => ({
  databaseConfigured: () => state.configured,
  publicEnv: () => ({
    url: "https://ttvasynaxkkcwrmvlorg.supabase.co",
    key: "public-test-key",
  }),
  siteUrl: () => new URL("https://mystron-henna.vercel.app"),
}));
vi.mock("../src/lib/supabase", () => ({ sessionDatabase: state.db }));

import { GET as startGithub } from "../src/app/auth/github/route";
import { GET as complete } from "../src/app/auth/callback/route";

function mockSession() {
  const auth = {
    signInWithOAuth: vi.fn().mockResolvedValue({
      data: {
        url: "https://ttvasynaxkkcwrmvlorg.supabase.co/auth/v1/authorize?provider=github",
      },
      error: null,
    }),
    exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
    getUser: vi.fn().mockResolvedValue({
      data: { user: { email_confirmed_at: "2026-10-30T00:00:00Z" } },
      error: null,
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
  const rpc = vi.fn().mockResolvedValue({
    data: { active: true, permissions: { "posts.read": "all" } },
    error: null,
  });
  state.db.mockResolvedValue({ auth, rpc });
  return { auth, rpc };
}

beforeEach(() => {
  state.configured = true;
  state.db.mockReset();
});

it("starts GitHub OAuth with the app callback, never adding a role", async () => {
  const { auth } = mockSession();
  const response = await startGithub();
  expect(response.headers.get("location")).toContain(
    "/auth/v1/authorize?provider=github",
  );
  expect(auth.signInWithOAuth).toHaveBeenCalledWith({
    provider: "github",
    options: { redirectTo: "https://mystron-henna.vercel.app/auth/callback" },
  });
});

it("fails safely when the provider is unavailable or redirects off project", async () => {
  state.configured = false;
  expect((await startGithub()).headers.get("location")).toContain(
    "reason=oauth",
  );
  state.configured = true;
  const { auth } = mockSession();
  auth.signInWithOAuth.mockResolvedValue({
    data: { url: "https://attacker.invalid/auth/v1/authorize" },
    error: null,
  });
  expect((await startGithub()).headers.get("location")).toContain(
    "reason=oauth",
  );
});

it("allows only confirmed, active, database-authorized admins", async () => {
  const { rpc } = mockSession();
  const request = new NextRequest(
    "https://mystron-henna.vercel.app/auth/callback?code=verified-code",
  );
  expect((await complete(request)).headers.get("location")).toBe(
    "https://mystron-henna.vercel.app/admin",
  );
  rpc.mockResolvedValue({
    data: { active: false, permissions: {} },
    error: null,
  });
  const result = await complete(request);
  expect(result.headers.get("location")).toContain("reason=access");
});

it("rejects unassigned identities and cleans up the local session", async () => {
  const { auth, rpc } = mockSession();
  rpc.mockResolvedValue({
    data: { active: false, permissions: {} },
    error: null,
  });
  await complete(
    new NextRequest(
      "https://mystron-henna.vercel.app/auth/callback?code=oauth-code",
    ),
  );
  expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
});

it("rejects missing codes and unverified email", async () => {
  expect(
    (
      await complete(
        new NextRequest("https://mystron-henna.vercel.app/auth/callback"),
      )
    ).headers.get("location"),
  ).toContain("reason=link-invalid");
  const { auth } = mockSession();
  auth.getUser.mockResolvedValue({
    data: { user: { email_confirmed_at: null } },
    error: null,
  });
  const response = await complete(
    new NextRequest(
      "https://mystron-henna.vercel.app/auth/callback?code=oauth-code",
    ),
  );
  expect(response.headers.get("location")).toContain("reason=email");
});
