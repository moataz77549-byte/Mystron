import type { NextRequest } from "next/server";
import { publicApi } from "@/lib/api";
import { publicAuthors } from "@/lib/public-catalog";
import { querySchema } from "@/lib/validation";
export async function GET(request: NextRequest) {
  return publicApi(request, async () => {
    const p = querySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    return {
      data: await publicAuthors(p.page, p.pageSize),
      page: p.page,
      pageSize: p.pageSize,
    };
  });
}
