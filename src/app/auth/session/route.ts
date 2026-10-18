import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sessionDatabase } from "@/lib/supabase";
import { sameOrigin } from "@/lib/origin";
import { rateLimit } from "@/lib/rate-limit";
import { failure } from "@/lib/api";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return failure("INVALID_ORIGIN", 403);
  try {
    if (
      !(await rateLimit(
        "session:" + (req.headers.get("x-vercel-forwarded-for") || "local"),
        10,
        900,
      ))
    )
      return failure("RATE_LIMITED", 429);
    const b = z
      .object({
        access_token: z.string().min(32).max(8192),
        refresh_token: z.string().min(8).max(1024),
      })
      .strict()
      .parse(await req.json());
    const db = await sessionDatabase();
    const result = await db.auth.setSession(b);
    if (result.error) return failure("INVALID_SESSION", 401);
    const verified = await db.auth.getUser();
    if (verified.error || !verified.data.user?.email_confirmed_at) {
      await db.auth.signOut();
      return failure("EMAIL_UNVERIFIED", 401);
    }
    return NextResponse.json(
      { data: { authenticated: true } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return failure("INVALID_SESSION", 400);
  }
}
