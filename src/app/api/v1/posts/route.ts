import type { NextRequest } from "next/server";
import { publicApi } from "@/lib/api";
import { posts } from "@/lib/content";
export async function GET(request: NextRequest) {
  return publicApi(request, async () => {
    return await posts(Object.fromEntries(request.nextUrl.searchParams));
  });
}
