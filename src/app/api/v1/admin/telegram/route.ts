import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizedUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/origin";
import { failure } from "@/lib/api";
import { aiFailure } from "@/lib/ai/http";
import { linkHash } from "@/lib/telegram/security";
import { rateLimit } from "@/lib/rate-limit";
export async function GET() {
  try {
    const identity = await authorizedUser();
    if (!identity) return failure("UNAUTHORIZED", 401);
    const result = await identity.db
      .from("telegram_links")
      .select("telegram_id,linked_at,enabled")
      .eq("user_id", identity.user.id)
      .maybeSingle();
    if (result.error) return failure("TELEGRAM_UNAVAILABLE", 503);
    return NextResponse.json(
      {
        data: {
          link: result.data,
          configured: !!(
            process.env.TELEGRAM_BOT_USERNAME &&
            process.env.TELEGRAM_GATEWAY_SECRET &&
            process.env.TELEGRAM_WEBHOOK_SECRET &&
            process.env.TELEGRAM_BOT_TOKEN
          ),
          pending_setup: false,
        },
      },
      { headers: { "Cache-Control": "private,no-store" } },
    );
  } catch (error) {
    return aiFailure(error);
  }
}
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return failure("INVALID_ORIGIN", 403);
  try {
    const identity = await authorizedUser();
    if (!identity) return failure("UNAUTHORIZED", 401);
    if (!(await rateLimit("telegram-link:" + identity.user.id, 5, 300)))
      return failure("RATE_LIMITED", 429);
    const { action } = z
      .object({ action: z.enum(["link", "unlink"]) })
      .strict()
      .parse(await req.json());
    if (action === "unlink") {
      const result = await identity.db.rpc("telegram_unlink");
      if (result.error) throw new Error("FORBIDDEN");
      return NextResponse.json({ data: { unlinked: true } });
    }
    const username = process.env.TELEGRAM_BOT_USERNAME;
    if (
      !username ||
      !/^\w{5,32}$/.test(username) ||
      !process.env.TELEGRAM_GATEWAY_SECRET
    )
      return failure("TELEGRAM_UNCONFIGURED", 503);
    const token = randomBytes(32).toString("hex");
    const result = await identity.db.rpc("telegram_create_link", {
      p_hash: linkHash(token),
    });
    if (result.error) throw new Error("FORBIDDEN");
    return NextResponse.json(
      {
        data: {
          url: `https://t.me/${username}?start=${token}`,
          expires_in: 300,
        },
      },
      {
        headers: {
          "Cache-Control": "private,no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch (error) {
    return aiFailure(error);
  }
}
