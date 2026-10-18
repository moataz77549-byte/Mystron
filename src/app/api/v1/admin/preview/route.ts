import { NextRequest, NextResponse } from "next/server";
import { authorizedUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/origin";
import { renderDocument } from "@/lib/editor/document";
import { failure } from "@/lib/api";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return failure("INVALID_ORIGIN", 403);
  if (!(await authorizedUser())) return failure("UNAUTHORIZED", 401);
  try {
    const text = await req.text();
    if (text.length > 800000) return failure("PAYLOAD_TOO_LARGE", 413);
    return NextResponse.json(
      { html: renderDocument(JSON.parse(text)) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return failure("INVALID_DOCUMENT", 400);
  }
}
