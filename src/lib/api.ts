import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { databaseConfigured } from "./env";
import { rateLimit } from "./rate-limit";
export function failure(
  code: string,
  status: number,
  headers: Record<string, string> = {},
) {
  return NextResponse.json(
    { error: { code } },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}
export async function publicApi(
  request: NextRequest,
  handler: () => Promise<unknown>,
) {
  try {
    if (!databaseConfigured()) return failure("DATABASE_NOT_CONFIGURED", 503);
    const ip =
      request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
      "local";
    if (!(await rateLimit("public:" + ip)))
      return failure("RATE_LIMITED", 429, { "Retry-After": "60" });
    return NextResponse.json(await handler(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ZodError) return failure("INVALID_QUERY", 400);
    return failure("SERVICE_UNAVAILABLE", 503);
  }
}
