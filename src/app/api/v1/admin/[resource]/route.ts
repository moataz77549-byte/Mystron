import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  controlRead,
  controlCommand,
  controlResources,
} from "@/lib/control/service";
import { rateLimit } from "@/lib/rate-limit";
import { authorizedUser } from "@/lib/auth";
import { csvCell } from "@/lib/control/schema";
import { cmsCommand } from "@/lib/cms";
import { sameOrigin } from "@/lib/origin";
import { failure } from "@/lib/api";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ resource: string }> },
) {
  if (!sameOrigin(req)) return failure("INVALID_ORIGIN", 403);
  if (Number(req.headers.get("content-length") || 0) > 1000000)
    return failure("PAYLOAD_TOO_LARGE", 413);
  try {
    const identity = await authorizedUser();
    if (!identity) return failure("UNAUTHORIZED", 401);
    if (!(await rateLimit("admin:" + identity.user.id, 60, 60)))
      return failure("RATE_LIMITED", 429, { "Retry-After": "60" });
    const body = await req.text();
    if (body.length > 1000000) return failure("PAYLOAD_TOO_LARGE", 413);
    const resource = (await params).resource;
    const raw = JSON.parse(body);
    const data = controlResources.includes(resource)
      ? await controlCommand(resource, raw)
      : await cmsCommand(resource, raw, identity);
    return NextResponse.json(
      { data },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (e) {
    if (e instanceof ZodError || e instanceof SyntaxError)
      return failure("INVALID_INPUT", 400);
    const message = e instanceof Error ? e.message : "";
    const known = [
      "UNAUTHORIZED",
      "FORBIDDEN",
      "VERSION_CONFLICT",
      "PIN_SETUP_REQUIRED",
      "PIN_VERIFICATION_REQUIRED",
      "OWNER_OR_SELF_PROTECTED",
      "ROLE_OUT_OF_AUTHORITY",
      "TARGET_OUT_OF_AUTHORITY",
      "SCOPE_OUT_OF_AUTHORITY",
      "INVALID_INVITATION",
      "INVITATION_EXISTS",
      "INVITATION_DELIVERY_FAILED",
      "CATEGORY_IN_USE",
      "MEDIA_IN_USE",
      "NOT_FOUND",
      "PUBLICATION_INCOMPLETE",
      "INVALID_SCHEDULE",
      "INVALID_INPUT",
      "SCHEMA_UPDATE_REQUIRED",
      "INVALID_OPERATION",
      "APPROVAL_REQUIRES_REVIEW",
    ];
    const code = known.find((c) => message.includes(c)) || "INVALID_OPERATION";
    return failure(
      code,
      ["UNAUTHORIZED"].includes(code)
        ? 401
        : code === "SCHEMA_UPDATE_REQUIRED"
          ? 503
          : code === "FORBIDDEN"
            ? 403
            : code === "VERSION_CONFLICT"
              ? 409
              : 400,
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    const resource = (await params).resource;
    const identity = await authorizedUser();
    if (!identity) return failure("UNAUTHORIZED", 401);
    if (!(await rateLimit("admin-read:" + identity.user.id, 120, 60)))
      return failure("RATE_LIMITED", 429, { "Retry-After": "60" });
    const data = await controlRead(resource, req.nextUrl.searchParams);
    if (
      req.nextUrl.searchParams.get("format") === "csv" &&
      ["analytics", "audit-logs"].includes(resource)
    ) {
      const rows = (
        resource === "analytics" ? data.posts : data.rows
      ) as Record<string, unknown>[];
      const fields =
        resource === "analytics"
          ? ["id", "title", "status", "published_at", "views", "comments"]
          : [
              "id",
              "actor_id",
              "action",
              "entity_type",
              "entity_id",
              "created_at",
              "request_id",
              "result",
            ];
      return new Response(
        "\uFEFF" +
          [
            fields.map(csvCell).join(","),
            ...rows.map((r) => fields.map((f) => csvCell(r[f])).join(",")),
          ].join("\r\n"),
        {
          headers: {
            "Content-Type": "text/csv;charset=utf-8",
            "Content-Disposition": `attachment; filename="${resource}.csv"`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    const c = e instanceof Error ? e.message : "SERVICE_UNAVAILABLE";
    return failure(
      ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "INVALID_PERIOD"].includes(c)
        ? c
        : "SERVICE_UNAVAILABLE",
      c === "UNAUTHORIZED"
        ? 401
        : c === "FORBIDDEN"
          ? 403
          : c === "NOT_FOUND"
            ? 404
            : c === "INVALID_PERIOD" || e instanceof ZodError
              ? 400
              : 503,
    );
  }
}

// Command POST remains compatible with Stage 2; PATCH supports partial control updates.
export const PATCH = POST;
