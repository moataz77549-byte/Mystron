import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  recover: vi.fn(),
  getUser: vi.fn(),
  update: vi.fn(),
  signOut: vi.fn(),
  limit: vi.fn(),
  removeCookie: vi.fn(),
  verifyOtp: vi.fn(),
}));
vi.mock("../src/lib/supabase", () => ({
  publicDatabase: () => ({ auth: { resetPasswordForEmail: state.recover } }),
  sessionDatabase: async () => ({
    auth: {
      getUser: state.getUser,
      updateUser: state.update,
      signOut: state.signOut,
      verifyOtp: state.verifyOtp,
    },
  }),
}));
vi.mock("../src/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => state.limit(...args),
}));
vi.mock("../src/lib/env", () => ({
  siteUrl: () => new URL("https://fixture.example.test"),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ delete: state.removeCookie }),
}));
import { POST as recover } from "../src/app/auth/recovery/route";
import { POST as update } from "../src/app/auth/password/route";
import { GET as confirm } from "../src/app/auth/confirm/route";
function req(
  path: string,
  value: unknown,
  origin = "https://fixture.example.test",
) {
  return new NextRequest("https://fixture.example.test/auth/" + path, {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}
const password = {
  password: "Long-fixture-secret-2026",
  confirmation: "Long-fixture-secret-2026",
};
beforeEach(() => {
  vi.clearAllMocks();
  state.limit.mockResolvedValue(true);
  state.recover.mockResolvedValue({ error: null });
  state.getUser.mockResolvedValue({
    data: { user: { id: "fixture-user", email_confirmed_at: "2026-10-21" } },
    error: null,
  });
  state.update.mockResolvedValue({ error: null });
  state.signOut.mockResolvedValue({ error: null });
  state.verifyOtp.mockResolvedValue({ error: null });
});
it("rejects cross-origin and invalid input before sending recovery mail", async () => {
  expect(
    (
      await recover(
        req("recovery", { email: "a@example.test" }, "https://evil.test"),
      )
    ).status,
  ).toBe(403);
  expect((await recover(req("recovery", { email: "bad" }))).status).toBe(400);
  expect(state.recover).not.toHaveBeenCalled();
});
it("uses the configured site and bounds requests by both IP and normalized email", async () => {
  const response = await recover(
    req("recovery", { email: "Owner@example.test" }),
  );
  expect(response.status).toBe(200);
  expect(state.recover).toHaveBeenCalledWith("Owner@example.test", {
    redirectTo: "https://fixture.example.test/auth/complete",
  });
  expect(state.limit).toHaveBeenCalledWith(
    "recovery-email:owner@example.test",
    3,
    900,
  );
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});
it("does not enumerate accounts, while reporting unavailable transport and throttling", async () => {
  state.recover.mockResolvedValue({
    error: { status: 400, code: "user_not_found" },
  });
  expect(
    (await recover(req("recovery", { email: "unknown@example.test" }))).status,
  ).toBe(200);
  state.recover.mockResolvedValue({
    error: { status: 503, message: "private SMTP credential" },
  });
  const unavailable = await recover(
    req("recovery", { email: "a@example.test" }),
  );
  expect(unavailable.status).toBe(503);
  expect(await unavailable.text()).not.toContain("private");
  state.limit.mockResolvedValue(false);
  const response = await recover(req("recovery", { email: "a@example.test" }));
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("900");
});
it("requires a confirmed server-verified user and matching strong passwords", async () => {
  expect(
    (
      await update(
        req("password", {
          ...password,
          confirmation: "different-fixture-password",
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await update(
        req("password", { password: "short", confirmation: "short" }),
      )
    ).status,
  ).toBe(400);
  state.getUser.mockResolvedValue({
    data: { user: null },
    error: { status: 401 },
  });
  expect((await update(req("password", password))).status).toBe(401);
  expect(state.update).not.toHaveBeenCalled();
});
it("saves only the current account, clears PIN proof, and signs out globally", async () => {
  const response = await update(req("password", password));
  expect(state.update).toHaveBeenCalledWith({ password: password.password });
  expect(state.removeCookie).toHaveBeenCalledWith("maystroon-proof");
  expect(state.signOut).toHaveBeenCalledWith({ scope: "global" });
  expect(await response.json()).toEqual({
    data: { updated: true, signed_out: true },
  });
});
it("reports a saved password separately when session cleanup fails", async () => {
  state.signOut.mockResolvedValue({ error: { status: 503 } });
  const response = await update(req("password", password));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    data: { updated: true, signed_out: false },
  });
});
it("does not clear proof or claim success when Auth rejects the password", async () => {
  state.update.mockResolvedValue({
    error: { code: "weak_password", message: "private provider detail" },
  });
  const response = await update(req("password", password));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: { code: "WEAK_PASSWORD" } });
  expect(state.removeCookie).not.toHaveBeenCalled();
  expect(state.signOut).not.toHaveBeenCalled();
});
it("routes only a successfully verified recovery token to password reset", async () => {
  const response = await confirm(
    new NextRequest(
      "https://fixture.example.test/auth/confirm?type=recovery&token_hash=fixture-hash&next=https://evil.test",
    ),
  );
  expect(response.headers.get("Location")).toBe(
    "https://fixture.example.test/auth/reset",
  );
  state.verifyOtp.mockResolvedValue({ error: { code: "otp_expired" } });
  const expired = await confirm(
    new NextRequest(
      "https://fixture.example.test/auth/confirm?type=recovery&token_hash=expired",
    ),
  );
  expect(expired.headers.get("Location")).toContain("reason=link-invalid");
});
