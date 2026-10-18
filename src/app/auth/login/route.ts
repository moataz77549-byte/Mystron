import { NextResponse, type NextRequest } from "next/server";
import { privilegedDatabase } from "@/lib/supabase";
import { randomUUID } from "node:crypto";
import { sessionDatabase } from "@/lib/supabase";
import { sameOrigin } from "@/lib/origin";
import { rateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";
import { failure } from "@/lib/api";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return failure("FORBIDDEN", 403);
  try {
    if (
      !(await rateLimit(
        "login:" + (request.headers.get("x-vercel-forwarded-for") || "local"),
        5,
        900,
      ))
    )
      return failure("RATE_LIMITED", 429);
    const parsed = loginSchema.safeParse(await request.json());
    if (!parsed.success) return failure("INVALID_INPUT", 400);
    const db = await sessionDatabase();
    const { data, error } = await db.auth.signInWithPassword(parsed.data);
    if (error || !data.user?.email_confirmed_at) {
      await privilegedDatabase().rpc("record_security_event", {
        p_actor: null,
        p_event: "LOGIN_FAILURE",
        p_result: "failure",
        p_request: randomUUID(),
      });
      return failure("INVALID_CREDENTIALS", 401);
    }
    const access = await db.rpc("admin_identity");
    if (
      access.error ||
      !access.data?.active ||
      !Object.keys(access.data.permissions || {}).length
    ) {
      await db.auth.signOut({ scope: "local" });
      return failure("ADMIN_NOT_ASSIGNED", 403);
    }
    await privilegedDatabase().rpc("record_security_event", {
      p_actor: data.user.id,
      p_event: "LOGIN_SUCCESS",
      p_result: "success",
      p_request: randomUUID(),
    });
    return NextResponse.json(
      { data: { authenticated: true } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return failure("SERVICE_UNAVAILABLE", 503);
  }
}
