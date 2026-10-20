import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizedUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/origin";
import { failure } from "@/lib/api";
import { tagQuery, tagMerge } from "@/lib/editorial/tag-schema";
function rpcFailure(error: { code?: string; message: string }) {
  if (error.code === "42501" || error.message.includes("FORBIDDEN"))
    return failure("FORBIDDEN", 403);
  if (error.message.includes("VERSION_CONFLICT"))
    return failure("VERSION_CONFLICT", 409);
  if (error.message.includes("TAG_BATCH_TOO_LARGE"))
    return failure("TAG_BATCH_TOO_LARGE", 400);
  if (error.code === "PGRST202") return failure("SCHEMA_UPDATE_REQUIRED", 503);
  return failure("SERVICE_UNAVAILABLE", 503);
}
export async function GET(req: NextRequest) {
  try {
    const identity = await authorizedUser();
    if (!identity) return failure("UNAUTHORIZED", 401);
    if (!identity.permissions["posts.read"]) return failure("FORBIDDEN", 403);
    const input = tagQuery.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!input.success) return failure("INVALID_INPUT", 400);
    if (!(await rateLimit("tags-read:" + identity.user.id, 120, 60)))
      return failure("RATE_LIMITED", 429, { "Retry-After": "60" });
    const result = await identity.db.rpc("admin_tag_list", {
      p_page: input.data.page,
      p_q: input.data.q,
    });
    if (result.error) return rpcFailure(result.error);
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
    if (
      !identity.permissions["posts.update"] ||
      !identity.permissions["posts.read"]
    )
      return failure("FORBIDDEN", 403);
    const input = tagMerge.safeParse(await req.json().catch(() => null));
    if (!input.success) return failure("INVALID_INPUT", 400);
    if (!(await rateLimit("tags-merge:" + identity.user.id, 10, 60)))
      return failure("RATE_LIMITED", 429, { "Retry-After": "60" });
    const result = await identity.db.rpc("cms_merge_tag", {
      p_source: input.data.source,
      p_target: input.data.target,
      p_expected_count: input.data.expected_count,
    });
    if (result.error) return rpcFailure(result.error);
    revalidatePath("/", "layout");
    return NextResponse.json(
      { data: result.data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return failure("SERVICE_UNAVAILABLE", 503);
  }
}
