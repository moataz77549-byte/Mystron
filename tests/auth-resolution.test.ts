import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  configured: true,
  user: vi.fn(),
  identity: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error("REDIRECT:" + url);
  },
}));
vi.mock("../src/lib/env", () => ({
  databaseConfigured: () => state.configured,
}));
vi.mock("../src/lib/supabase", () => ({
  sessionDatabase: async () => ({
    auth: { getUser: state.user },
    rpc: state.identity,
  }),
}));
import {
  authorizedUser,
  requireAdmin,
  requirePermission,
} from "../src/lib/auth";
beforeEach(() => {
  state.configured = true;
  state.user.mockReset().mockResolvedValue({
    data: {
      user: {
        id: "fixture-user",
        email_confirmed_at: "2026-10-19",
        user_metadata: { role: "OWNER" },
      },
    },
    error: null,
  });
  state.identity.mockReset().mockResolvedValue({
    data: {
      active: true,
      roles: ["AUTHOR"],
      permissions: { "posts.read": "own" },
      pin_configured: false,
      scope: { mode: "all", category_ids: [] },
    },
    error: null,
  });
});
it("trusts current database authorization rather than editable metadata", async () => {
  const identity = await authorizedUser();
  expect(identity?.roles).toEqual(["AUTHOR"]);
  await expect(requirePermission("users.manage")).rejects.toThrow("FORBIDDEN");
  state.identity.mockResolvedValue({ data: { active: false }, error: null });
  expect(await authorizedUser()).toBeNull();
  await expect(requireAdmin()).rejects.toThrow("reason=access");
});
it("shows session and service failures separately while failing closed", async () => {
  state.user.mockResolvedValue({
    data: { user: null },
    error: { status: 401 },
  });
  await expect(requireAdmin()).rejects.toThrow("reason=session");
  expect(state.identity).not.toHaveBeenCalled();
  state.user.mockResolvedValue({
    data: { user: { id: "fixture-user", email_confirmed_at: "2026-10-19" } },
    error: null,
  });
  state.identity.mockResolvedValue({
    data: null,
    error: { message: "private diagnostic" },
  });
  await expect(requireAdmin()).rejects.toThrow("reason=service");
  expect(await authorizedUser()).toBeNull();
});
it("never authorizes unconfirmed or unconfigured accounts", async () => {
  state.user.mockResolvedValue({
    data: { user: { id: "fixture-user", email_confirmed_at: null } },
    error: null,
  });
  await expect(requireAdmin()).rejects.toThrow("reason=email");
  expect(state.identity).not.toHaveBeenCalled();
  state.configured = false;
  expect(await authorizedUser()).toBeNull();
});
