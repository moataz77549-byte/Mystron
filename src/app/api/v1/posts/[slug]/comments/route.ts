import { NextRequest } from "next/server";
import { engagement, publicComments } from "@/lib/engagement";
import { publicApi } from "@/lib/api";
import { z } from "zod";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  return engagement(req, (await params).slug, "comments");
}
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  return publicApi(req, async () =>
    publicComments(
      (await params).slug,
      z.coerce
        .number()
        .int()
        .min(1)
        .max(10000)
        .parse(req.nextUrl.searchParams.get("page") || 1),
    ),
  );
}
