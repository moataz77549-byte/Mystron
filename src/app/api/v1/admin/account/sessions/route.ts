import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizedUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/origin";
import { failure } from "@/lib/api";
function databaseFailure(error: { code?: string; message: string }) {
  if (error.code === "42501") return failure("FORBIDDEN", 403);
  if (error.message.includes("NOT_FOUND")) return failure("NOT_FOUND", 404);
  if (error.message.includes("CURRENT_SESSION_USE_LOGOUT"))
    return failure("CURRENT_SESSION_USE_LOGOUT", 400);
  if (error.code === "PGRST202") return failure("SCHEMA_UPDATE_REQUIRED", 503);
  return failure("SERVICE_UNAVAILABLE", 503);
}
export async function GET(req: NextRequest) {
  try {
    const identity = await authorizedUser();
    if (!identity) return failure("UNAUTHORIZED", 401);
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .safeParse(req.nextUrl.searchParams.get("page") || 1);
    if (!page.success) return failure("INVALID_INPUT", 400);
    if (!(await rateLimit("my-sessions-read:" + identity.user.id, 60, 60)))
      return failure("RATE_LIMITED", 429, { "Retry-After": "60" });
    const result = await identity.db.rpc("admin_my_sessions", {
      p_page: page.data,
    });
    if (result.error) return databaseFailure(result.error);
    return NextResponse.json(
      { data: result.data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return failure("SERVICE_UNAVAILABLE", 503);
  }
}
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return failure("INVALID_ORIGIN", 403);
  try {
    const identity = await authorizedUser();
    if (!identity) return failure("UNAUTHORIZED", 401);
    const input = z
      .object({ id: z.uuid() })
      .strict()
      .safeParse(await req.json().catch(() => null));
    if (!input.success) return failure("INVALID_INPUT", 400);
    if (!(await rateLimit("my-sessions-revoke:" + identity.user.id, 20, 60)))
      return failure("RATE_LIMITED", 429, { "Retry-After": "60" });
    const result = await identity.db.rpc("admin_revoke_my_session", {
      p_session: input.data.id,
    });
    if (result.error) return databaseFailure(result.error);
    return NextResponse.json(
      { data: result.data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return failure("SERVICE_UNAVAILABLE", 503);
  }
}
