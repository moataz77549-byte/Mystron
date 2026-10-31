import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../src/lib/supabase", () => ({ privilegedDatabase: () => state }));
import { processTelegram } from "../src/lib/telegram/engine";
import { linkHash } from "../src/lib/telegram/security";
import { telegramRpcError } from "../src/lib/telegram/errors";
const identity = {
  user_id: "user",
  permissions: {},
  state: {},
  state_version: 1,
  permission_fingerprint: "fixture",
};
const message = (text = "/start") => ({
  update_id: 10,
  message: {
    message_id: 10,
    from: { id: 42 },
    chat: { id: 42, type: "private" as const },
    text,
  },
});
beforeEach(() => {
  state.rpc.mockReset().mockResolvedValue({ data: identity, error: null });
  vi.stubEnv("AI_ENABLED", "false");
});
afterEach(() => vi.unstubAllEnvs());
it("does not acknowledge an identity database outage as an unlinked account", async () => {
  state.rpc.mockResolvedValueOnce({
    data: null,
    error: { code: "PGRST002", message: "private database diagnostic" },
  });
  await expect(processTelegram(message())).rejects.toThrow(
    "DATABASE_UNAVAILABLE",
  );
  expect(state.rpc).toHaveBeenCalledTimes(1);
  state.rpc.mockRejectedValueOnce(new Error("private transport diagnostic"));
  await expect(processTelegram(message())).rejects.toThrow(
    "DATABASE_UNAVAILABLE",
  );
});
it("still explains an actually expired or absent administrative link", async () => {
  state.rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "TELEGRAM_NOT_LINKED" },
  });
  expect((await processTelegram(message())).text).toContain("غير مربوط");
});
it("hashes the raw secret for both manual and deep-link account linking", async () => {
  for (const command of ["/start", "/link"]) {
    state.rpc.mockClear();
    await processTelegram(message(command + " " + "a".repeat(64)));
    expect(state.rpc).toHaveBeenNthCalledWith(1, "telegram_consume_link", {
      p_hash: linkHash("a".repeat(64)),
      p_telegram_id: 42,
    });
  }
});
it("preserves state conflicts and rejects stored diagnostics from user replies", () => {
  expect(telegramRpcError({ message: "STATE_CONFLICT" }).message).toBe(
    "STATE_CONFLICT",
  );
  expect(
    telegramRpcError({ message: "database TELEGRAM_something failed" }).message,
  ).toBe("DATABASE_UNAVAILABLE");
});
it("blocks stale AI callback buttons before loading private article content", async () => {
  const result = await processTelegram({
    update_id: 11,
    callback_query: {
      id: "callback",
      from: { id: 42 },
      message: message().message,
      data: "assist:rewrite:post-id",
    },
  });
  expect(result.text).toContain("معطل");
  expect(state.rpc).toHaveBeenCalledTimes(1);
});
