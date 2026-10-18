import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { publicDatabase } from "@/lib/supabase";
import { sameOrigin } from "@/lib/origin";
import { rateLimit } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/env";
import { failure } from "@/lib/api";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return failure("INVALID_ORIGIN", 403);
  try {
    const b = z
      .object({ email: z.email().max(254) })
      .strict()
      .parse(await req.json());
    if (
      !(await rateLimit(
        "magic:" +
          b.email.toLowerCase() +
          ":" +
          (req.headers.get("x-vercel-forwarded-for") || "local"),
        5,
        900,
      ))
    )
      return failure("RATE_LIMITED", 429);
    await publicDatabase().auth.signInWithOtp({
      email: b.email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: new URL("/auth/complete", siteUrl()).href,
      },
    });
    return NextResponse.json(
      { data: { requested: true } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return failure("SERVICE_UNAVAILABLE", 503);
  }
}
