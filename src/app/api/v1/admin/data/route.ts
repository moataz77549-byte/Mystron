import { NextRequest, NextResponse } from "next/server";
import { authorizedUser } from "@/lib/auth";
import { failure } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { postQuerySchema, postListArguments } from "@/lib/editorial/post-query";
export async function GET(req: NextRequest) {
  try {
    return await readData(req);
  } catch (error) {
    return failure(
      error instanceof z.ZodError ? "INVALID_INPUT" : "SERVICE_UNAVAILABLE",
      error instanceof z.ZodError ? 400 : 503,
    );
  }
}
async function readData(req: NextRequest) {
  const identity = await authorizedUser();
  if (!identity) return failure("UNAUTHORIZED", 401);
  const resource = req.nextUrl.searchParams.get("resource");
  const tables: Record<string, string> = {
    posts: "posts",
    categories: "categories",
    authors: "authors",
    media: "media_assets",
    comments: "comments",
    ticker: "ticker_items",
    revisions: "post_revisions",
    runs: "publishing_runs",
  };
  if (!resource || !tables[resource]) return failure("INVALID_RESOURCE", 400);
  const permissions: Record<string, string> = {
    posts: "posts.read",
    categories: "categories.manage",
    authors: "authors.manage",
    media: "media.manage",
    comments: "comments.moderate",
    ticker: "announcements.manage",
    revisions: "posts.update",
    runs: "posts.schedule",
  };
  if (!identity.permissions[permissions[resource]])
    return failure("FORBIDDEN", 403);
  if (!(await rateLimit("admin-data:" + identity.user.id, 120, 60)))
    return failure("RATE_LIMITED", 429, { "Retry-After": "60" });
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .safeParse(req.nextUrl.searchParams.get("page") || 1);
  if (!page.success) return failure("INVALID_INPUT", 400);
  if (resource === "posts") {
    const input = Object.fromEntries(req.nextUrl.searchParams);
    delete input.resource;
    const query = postQuerySchema.parse(input);
    const { data, error } = await identity.db.rpc(
      "admin_post_list_filtered",
      postListArguments(query),
    );
    if (error?.code === "PGRST202" || error?.code === "42883")
      return failure("SCHEMA_UPDATE_REQUIRED", 503);
    if (error)
      return failure(
        error.code === "42501" ? "FORBIDDEN" : "INVALID_QUERY",
        error.code === "42501" ? 403 : 400,
      );
    return NextResponse.json(
      {
        data: data.rows,
        total: data.total,
        page: query.page,
        pageSize: query.page_size,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const fields = resource === "revisions" ? "id,created_at" : "*";
  let q = identity.db.from(tables[resource]).select(fields, { count: "exact" });
  if (resource === "revisions") {
    const id = z.uuid().safeParse(req.nextUrl.searchParams.get("post"));
    if (!id.success) return failure("INVALID_INPUT", 400);
    q = q.eq("post_id", id.data);
  }
  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .range((page.data - 1) * 100, page.data * 100 - 1);
  if (error) return failure("SERVICE_UNAVAILABLE", 503);
  return NextResponse.json(
    { data, total: count || 0, page: page.data, pageSize: 100 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
