import { NextRequest } from "next/server";
import { publicApi } from "@/lib/api";
import { posts } from "@/lib/content";
export async function GET(req: NextRequest) {
  return publicApi(req, async () =>
    posts(Object.fromEntries(req.nextUrl.searchParams)),
  );
}
