import "server-only";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { AIError } from "../../../packages/ai/provider";
import { siteUrl } from "../env";
import type { Subject } from "./service";
export function aiSubject(req: NextRequest, userId?: string) {
  const secret = process.env.RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32) throw new AIError("AI_UNCONFIGURED");
  const previous = req.cookies.get("maystroon-ai")?.value;
  const token =
    previous && /^[a-f0-9]{64}$/.test(previous)
      ? previous
      : randomBytes(32).toString("hex");
  const source =
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "local";
  const day = new Date().toISOString().slice(0, 10);
  const digest = (value: string) =>
    createHmac("sha256", secret).update(value).digest("hex");
  return {
    subject: {
      session: digest("session:" + token),
      visitor: digest("visitor:" + day + ":" + source),
      ...(userId ? { userId } : {}),
    } satisfies Subject,
    token,
  };
}
export function aiCookie(response: NextResponse, token: string) {
  response.cookies.set("maystroon-ai", token, {
    httpOnly: true,
    secure: siteUrl().protocol === "https:",
    sameSite: "strict",
    maxAge: 86400,
    path: "/",
  });
  return response;
}
export function aiFailure(error: unknown) {
  const code =
    error instanceof ZodError || error instanceof SyntaxError
      ? "INVALID_INPUT"
      : error instanceof AIError
        ? error.code
        : error instanceof Error &&
            [
              "FORBIDDEN",
              "UNAUTHORIZED",
              "VERSION_CONFLICT",
              "PIN_SETUP_REQUIRED",
              "PIN_VERIFICATION_REQUIRED",
            ].includes(error.message)
          ? error.message
          : "AI_UNAVAILABLE";
  const status =
    code === "UNAUTHORIZED"
      ? 401
      : code === "FORBIDDEN" || code.startsWith("PIN_")
        ? 403
        : code === "POST_NOT_FOUND"
          ? 404
          : code === "AI_QUOTA_EXCEEDED"
            ? 429
            : code === "INVALID_INPUT"
              ? 400
              : code === "VERSION_CONFLICT"
                ? 409
                : code === "CANCELLED"
                  ? 499
                  : 503;
  return NextResponse.json(
    { error: { code, request_id: randomUUID() } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
