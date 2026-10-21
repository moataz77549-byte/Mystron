import type { NextRequest } from "next/server";
import { publicApi, failure } from "@/lib/api";
import { categories } from "@/lib/content";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const response = await publicApi(request, async () => {
    const slug = (await params).slug;
    return {
      data: (await categories()).find((item) => item.slug === slug) || null,
    };
  });
  if (response.status === 200 && !(await response.clone().json()).data)
    return failure("NOT_FOUND", 404);
  return response;
}
