import type { NextRequest } from "next/server";
import { publicApi } from "@/lib/api";
import { posts } from "@/lib/content";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  return publicApi(request, async () =>
    posts({
      ...Object.fromEntries(request.nextUrl.searchParams),
      author: (await params).slug,
    }),
  );
}
