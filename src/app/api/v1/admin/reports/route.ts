import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizedUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/origin";
import { failure } from "@/lib/api";
import { reportAction } from "@/lib/editorial/report-schema";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return failure("INVALID_ORIGIN", 403);
  try {
    const identity = await authorizedUser();
    if (!identity) return failure("UNAUTHORIZED", 401);
    if (!identity.permissions["comments.moderate"])
      return failure("FORBIDDEN", 403);
    const input = reportAction.safeParse(await req.json().catch(() => null));
    if (!input.success) return failure("INVALID_INPUT", 400);
    if (!(await rateLimit("report-review:" + identity.user.id, 60, 60)))
      return failure("RATE_LIMITED", 429, { "Retry-After": "60" });
    const result = await identity.db.rpc("cms_resolve_report", {
      p_id: input.data.id,
      p_action: input.data.action,
    });
    if (result.error) {
      const error = result.error;
      if (error.code === "42501" || error.message.includes("FORBIDDEN"))
        return failure("FORBIDDEN", 403);
      if (error.message.includes("NOT_FOUND")) return failure("NOT_FOUND", 404);
      if (error.code === "PGRST202")
        return failure("SCHEMA_UPDATE_REQUIRED", 503);
      return failure("SERVICE_UNAVAILABLE", 503);
    }
    revalidatePath("/", "layout");
    return NextResponse.json(
      { data: result.data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return failure("SERVICE_UNAVAILABLE", 503);
  }
}
