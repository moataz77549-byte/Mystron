import { NextRequest, NextResponse } from "next/server";
import { publicDatabase } from "@/lib/supabase";
import { sameOrigin } from "@/lib/origin";
import { siteUrl } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { failure } from "@/lib/api";
import { recoverySchema } from "@/lib/auth-password";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return failure("INVALID_ORIGIN", 403);
  try {
    const input = recoverySchema.safeParse(await req.json().catch(() => null));
    if (!input.success) return failure("INVALID_INPUT", 400);
    const ip =
      req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
      "local";
    if (
      !(await rateLimit("recovery-ip:" + ip, 5, 900)) ||
      !(await rateLimit(
        "recovery-email:" + input.data.email.toLowerCase(),
        3,
        900,
      ))
    )
      return failure("RATE_LIMITED", 429, { "Retry-After": "900" });
    const result = await publicDatabase().auth.resetPasswordForEmail(
      input.data.email,
      {
        redirectTo: new URL("/auth/complete", siteUrl()).href,
      },
    );
    if (result.error?.status === 429)
      return failure("RATE_LIMITED", 429, { "Retry-After": "900" });
    if (result.error && (!result.error.status || result.error.status >= 500))
      return failure("SERVICE_UNAVAILABLE", 503);
    // Identical acknowledgement for existing and unknown addresses.
    return NextResponse.json(
      { data: { requested: true } },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch {
    return failure("SERVICE_UNAVAILABLE", 503);
  }
}
