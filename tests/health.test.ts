import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  configured: true,
  publicReady: true,
  privilegedReady: true,
  publicCalls: 0,
  privilegedCalls: 0,
}));
vi.mock("../src/lib/env", () => ({
  databaseConfigured: () => state.configured,
}));
vi.mock("../src/lib/supabase", () => ({
  publicDatabase: () => ({
    from: () => ({
      select: () => ({
        limit: async () => {
          state.publicCalls++;
          return { error: state.publicReady ? null : { message: "failed" } };
        },
      }),
    }),
  }),
  privilegedDatabase: () => ({
    from: () => ({
      select: () => ({
        limit: async () => {
          state.privilegedCalls++;
          return {
            error: state.privilegedReady ? null : { message: "failed" },
          };
        },
      }),
    }),
  }),
}));
import { GET } from "../src/app/api/v1/health/route";

beforeEach(() => {
  state.configured = true;
  state.publicReady = true;
  state.privilegedReady = true;
  state.publicCalls = 0;
  state.privilegedCalls = 0;
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-key");
  vi.stubEnv("RATE_LIMIT_SECRET", "r".repeat(32));
});
afterEach(() => vi.unstubAllEnvs());

describe("read-only service readiness", () => {
  it("returns 200 for healthy public and privileged clients", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        service: "maystroon",
        version: "v1",
        database: "ready",
        api: "ready",
      },
    });
    expect(state.publicCalls).toBe(1);
    expect(state.privilegedCalls).toBe(1);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 503 when the privileged query fails", async () => {
    state.privilegedReady = false;
    const response = await GET();
    expect(response.status).toBe(503);
    expect((await response.json()).data).toMatchObject({
      database: "ready",
      api: "unavailable",
    });
  });

  it("returns 503 when a server secret is missing", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const response = await GET();
    expect(response.status).toBe(503);
    expect((await response.json()).data.api).toBe("unconfigured");
    expect(state.privilegedCalls).toBe(0);
  });

  it("fails closed when the public database is unavailable", async () => {
    state.publicReady = false;
    const response = await GET();
    expect(response.status).toBe(503);
    expect((await response.json()).data.database).toBe("unavailable");
  });

  it("does not query databases when public config is missing", async () => {
    state.configured = false;
    const response = await GET();
    expect(response.status).toBe(503);
    expect(state.publicCalls).toBe(0);
    expect(state.privilegedCalls).toBe(0);
  });
});
