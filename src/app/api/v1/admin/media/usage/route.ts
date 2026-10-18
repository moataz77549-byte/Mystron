import { NextRequest, NextResponse } from "next/server";
import { authorizedUser } from "@/lib/auth";
import { failure } from "@/lib/api";
import { z } from "zod";
export async function GET(req: NextRequest) {
  const i = await authorizedUser();
  if (!i) return failure("UNAUTHORIZED", 401);
  const id = z.uuid().safeParse(req.nextUrl.searchParams.get("id"));
  if (!id.success) return failure("INVALID_INPUT", 400);
  const [a, b] = await Promise.all([
    i.db.from("post_media").select("post_id").eq("asset_id", id.data),
    i.db
      .from("posts")
      .select("id,title")
      .or(
        `cover_asset_id.eq.${id.data},thumbnail_asset_id.eq.${id.data},share_asset_id.eq.${id.data}`,
      ),
  ]);
  if (a.error || b.error) return failure("SERVICE_UNAVAILABLE", 503);
  const ids = [
    ...new Set([...a.data.map((x) => x.post_id), ...b.data.map((x) => x.id)]),
  ];
  return NextResponse.json(
    { data: ids },
    { headers: { "Cache-Control": "no-store" } },
  );
}
