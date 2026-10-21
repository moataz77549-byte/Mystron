import type { NextRequest } from "next/server";
import { publicApi, failure } from "@/lib/api";
import { post, posts } from "@/lib/content";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const response = await publicApi(request, async () => {
    const article = await post((await params).slug);
    if (!article) return { data: null };
    // Reuse the public visibility filter; never query a privileged CMS client.
    const result = await posts({
      author: article.authors?.slug,
      pageSize: "7",
    });
    return {
      data: result.data.filter((item) => item.id !== article.id).slice(0, 6),
    };
  });
  if (response.status === 200 && (await response.clone().json()).data === null)
    return failure("NOT_FOUND", 404);
  return response;
}
