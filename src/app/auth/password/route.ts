import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sessionDatabase } from "@/lib/supabase";
import { sameOrigin } from "@/lib/origin";
import { rateLimit } from "@/lib/rate-limit";
import { failure } from "@/lib/api";
import { passwordSchema, passwordFailure } from "@/lib/auth-password";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return failure("INVALID_ORIGIN", 403);
  try {
    const input = passwordSchema.safeParse(await req.json().catch(() => null));
    if (!input.success) return failure("INVALID_INPUT", 400);
    const db = await sessionDatabase();
    const verified = await db.auth.getUser();
    if (verified.error || !verified.data.user?.email_confirmed_at)
      return failure("UNAUTHORIZED", 401);
    if (!(await rateLimit("password:" + verified.data.user.id, 5, 900)))
      return failure("RATE_LIMITED", 429, { "Retry-After": "900" });
    // The session client updates only the authenticated user's password.
    const result = await db.auth.updateUser({ password: input.data.password });
    if (result.error) {
      const error = passwordFailure(result.error);
      return failure(
        error.code,
        error.status,
        error.status === 429 ? { "Retry-After": "900" } : {},
      );
    }
    (await cookies()).delete("maystroon-proof");
    // Password persistence and sign-out are separate results: never tell the
    // user the password failed after Supabase has already saved it.
    let signedOut = false;
    try {
      const signout = await db.auth.signOut({ scope: "global" });
      signedOut = !signout.error;
    } catch {
      /* Surface partial session cleanup without repeating the write. */
    }
    return NextResponse.json(
      { data: { updated: true, signed_out: signedOut } },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch {
    return failure("SERVICE_UNAVAILABLE", 503);
  }
}
