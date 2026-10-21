import type { NextRequest } from "next/server";
import { publicApi } from "@/lib/api";
import { featuredPost, homeData, popularPosts } from "@/lib/content";
export async function GET(request: NextRequest) {
  return publicApi(request, async () => {
    const [home, featured, popular] = await Promise.all([
      homeData(),
      featuredPost(),
      popularPosts(),
    ]);
    if (home.state !== "ready") throw new Error("HOME_UNAVAILABLE");
    return { data: { ...home, featured, popular } };
  });
}
