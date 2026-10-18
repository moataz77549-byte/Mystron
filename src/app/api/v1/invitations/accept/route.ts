import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { sessionDatabase } from "@/lib/supabase";
import { sameOrigin } from "@/lib/origin";
import { rateLimit } from "@/lib/rate-limit";
import { failure } from "@/lib/api";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return failure("INVALID_ORIGIN", 403);
  try {
    const db = await sessionDatabase();
    const {
      data: { user },
      error,
    } = await db.auth.getUser();
    if (error || !user?.email_confirmed_at) return failure("UNAUTHORIZED", 401);
    if (!(await rateLimit("invite-accept:" + user.id, 10, 900)))
      return failure("RATE_LIMITED", 429);
    const { token } = z
      .object({ token: z.string().regex(/^[\w-]{43}$/) })
      .strict()
      .parse(await req.json());
    const result = await db.rpc("accept_admin_invitation", {
      p_hash: createHash("sha256").update(token).digest("hex"),
    });
    if (result.error) return failure("INVITATION_INVALID_OR_EXPIRED", 403);
    return NextResponse.json(
      { data: { accepted: true } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return failure("INVALID_INPUT", 400);
  }
}
