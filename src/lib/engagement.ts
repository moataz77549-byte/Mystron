import "server-only";
import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { privilegedDatabase, publicDatabase } from "./supabase";
import { rateLimit } from "./rate-limit";
import { failure } from "./api";
import { sameOrigin } from "./origin";
export async function publicComments(id: string, page = 1) {
  z.uuid().parse(id);
  const { data, error, count } = await publicDatabase()
    .from("comments")
    .select("id,post_id,parent_id,depth,guest_name,body,created_at", {
      count: "exact",
    })
    .eq("post_id", id)
    .order("created_at")
    .range((page - 1) * 30, page * 30 - 1);
  if (error) throw error;
  return { data, total: count || 0, page, pageSize: 30 };
}
function visitor(req: NextRequest) {
  const secret = process.env.RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32) throw new Error("SERVER_NOT_CONFIGURED");
  const existing = req.cookies.get("maystroon-visitor")?.value;
  const day = new Date().toISOString().slice(0, 10);
  const transient = createHmac("sha256", secret)
    .update(
      `${day}:${req.headers.get("x-vercel-forwarded-for")?.split(",")[0] || "local"}:${req.headers.get("user-agent") || "unknown"}`,
    )
    .digest("hex");
  const fallback = `${transient.slice(0, 8)}-${transient.slice(8, 12)}-4${transient.slice(13, 16)}-8${transient.slice(17, 20)}-${transient.slice(20, 32)}`;
  const id =
    existing && z.uuid().safeParse(existing).success ? existing : fallback;
  return {
    id,
    hash: createHmac("sha256", secret).update(`${day}:${id}`).digest("hex"),
  };
}
export async function engagement(
  req: NextRequest,
  id: string,
  kind: "comments" | "views" | "reports",
) {
  if (!sameOrigin(req)) return failure("INVALID_ORIGIN", 403);
  try {
    z.uuid().parse(id);
    const policy =
      kind === "comments"
        ? await privilegedDatabase().rpc("comment_policy_server")
        : null;
    if (policy?.error) throw policy.error;
    const commentPolicy = policy?.data;
    const ip =
      req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
      "local";
    if (
      !(await rateLimit(
        `${kind}:${ip}`,
        kind === "comments"
          ? Number(commentPolicy?.limit || 5)
          : kind === "reports"
            ? 10
            : 60,
        kind === "comments" ? Number(commentPolicy?.window_seconds || 60) : 60,
      ))
    )
      return failure("RATE_LIMITED", 429);
    let data: unknown;
    if (kind === "comments") {
      const b = z
        .object({
          name: z.string().trim().min(1).max(100),
          email: z.email().max(254).or(z.literal("")).optional(),
          body: z
            .string()
            .trim()
            .min(1)
            .max(5000)
            .refine((s) => !/(https?:\/\/|<[^>]+>)/i.test(s)),
          parent_id: z.uuid().nullable().optional(),
          website: z.literal("").optional(),
        })
        .strict()
        .parse(await req.json());
      const r = await privilegedDatabase().rpc("submit_guest_comment", {
        p_post_id: id,
        p_parent_id: b.parent_id || null,
        p_name: b.name,
        p_email: b.email || "",
        p_body: b.body,
      });
      if (r.error) return failure("COMMENTS_CLOSED_OR_INVALID", 400);
      data = {
        id: r.data,
        status:
          commentPolicy?.pre_moderation === false ? "approved" : "pending",
      };
    } else {
      const v = visitor(req);
      if (kind === "views") {
        if (
          /bot|crawler|spider|preview|headless/i.test(
            req.headers.get("user-agent") || "",
          )
        )
          return NextResponse.json({ data: { counted: false } });
        const r = await privilegedDatabase().rpc("record_post_view", {
          p_post_id: id,
          p_visitor_hash: v.hash,
        });
        if (r.error) throw r.error;
        data = { counted: r.data };
      } else {
        const b = z
          .object({ reason: z.string().min(3).max(1000) })
          .strict()
          .parse(await req.json());
        const r = await privilegedDatabase().rpc("report_comment", {
          p_comment_id: id,
          p_reason: b.reason,
          p_visitor_hash: v.hash,
        });
        if (r.error) return failure("INVALID_REPORT", 400);
        data = { submitted: true };
      }
      const response = NextResponse.json(
        { data },
        { headers: { "Cache-Control": "no-store" } },
      );
      response.cookies.set("maystroon-visitor", v.id, {
        httpOnly: true,
        secure: req.nextUrl.protocol === "https:",
        sameSite: "lax",
        maxAge: 86400,
        path: "/",
      });
      return response;
    }
    return NextResponse.json(
      { data },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(
      e instanceof z.ZodError ? "INVALID_INPUT" : "SERVICE_UNAVAILABLE",
      e instanceof z.ZodError ? 400 : 503,
    );
  }
}
