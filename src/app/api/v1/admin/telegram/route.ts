import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizedUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/origin";
import { failure } from "@/lib/api";
import { linkHash } from "@/lib/telegram/security";
import { rateLimit } from "@/lib/rate-limit";

function botConfiguration() {
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  return {
    username,
    configured: !!(
      username &&
      /^[A-Za-z0-9_]{5,32}$/.test(username) &&
      (process.env.TELEGRAM_GATEWAY_SECRET?.length || 0) >= 32 &&
      (process.env.TELEGRAM_WEBHOOK_SECRET?.length || 0) >= 32 &&
      process.env.TELEGRAM_BOT_TOKEN
    ),
  };
}
const privateHeaders = {
  "Cache-Control": "private,no-store",
  "Referrer-Policy": "no-referrer",
};
function unavailable(requestId: string) {
  // Never log RPC payloads, tokens or credential-bearing upstream messages.
  console.warn(
    JSON.stringify({
      event: "TELEGRAM_LINK_UNAVAILABLE",
      request_id: requestId,
    }),
  );
  return failure("TELEGRAM_UNAVAILABLE", 503, { "x-request-id": requestId });
}
export async function GET() {
  const requestId = randomUUID();
  try {
    const identity = await authorizedUser();
    if (!identity) return failure("UNAUTHORIZED", 401);
    const result = await identity.db
      .from("telegram_links")
      .select("telegram_id,linked_at,enabled")
      .eq("user_id", identity.user.id)
      .maybeSingle();
    if (result.error) return unavailable(requestId);
    return NextResponse.json(
      {
        data: {
          link: result.data,
          configured: botConfiguration().configured,
          pending_setup: false,
          server_time: new Date().toISOString(),
        },
      },
      { headers: privateHeaders },
    );
  } catch {
    return unavailable(requestId);
  }
}
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return failure("INVALID_ORIGIN", 403);
  const requestId = randomUUID();
  try {
    const identity = await authorizedUser();
    if (!identity) return failure("UNAUTHORIZED", 401);
    const { action } = z
      .object({ action: z.enum(["link", "unlink"]) })
      .strict()
      .parse(await req.json());
    const config = botConfiguration();
    // Missing configuration does not burn a link attempt. Revocation has an
    // independent budget and works even if a bot setting was removed.
    if (action === "link" && !config.configured)
      return failure("TELEGRAM_UNCONFIGURED", 503);
    if (!(await rateLimit(`telegram-${action}:` + identity.user.id, 5, 300)))
      return failure("RATE_LIMITED", 429, { "Retry-After": "300" });
    if (action === "unlink") {
      const result = await identity.db.rpc("telegram_unlink");
      if (result.error)
        return result.error.code === "42501"
          ? failure("FORBIDDEN", 403)
          : unavailable(requestId);
      return NextResponse.json(
        { data: { unlinked: true } },
        { headers: privateHeaders },
      );
    }
    const token = randomBytes(32).toString("hex");
    const result = await identity.db.rpc("telegram_create_link", {
      p_hash: linkHash(token),
    });
    if (result.error) {
      if (!(await authorizedUser())) return failure("UNAUTHORIZED", 401);
      return result.error.code === "42501"
        ? failure("FORBIDDEN", 403)
        : unavailable(requestId);
    }
    return NextResponse.json(
      {
        data: {
          url: `https://t.me/${config.username}?start=${token}`,
          expires_in: 300,
          expires_at: new Date(Date.now() + 300000).toISOString(),
        },
      },
      { headers: { ...privateHeaders, "x-request-id": requestId } },
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return failure("INVALID_INPUT", 400);
    return unavailable(requestId);
  }
}
