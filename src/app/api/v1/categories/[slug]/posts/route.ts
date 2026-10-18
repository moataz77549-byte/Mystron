import { NextRequest } from "next/server";
import { publicApi } from "@/lib/api";
import { posts } from "@/lib/content";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  return publicApi(req, async () =>
    posts({
      ...Object.fromEntries(req.nextUrl.searchParams),
      category: (await params).slug,
    }),
  );
}
