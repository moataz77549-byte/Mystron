import type { NextRequest } from "next/server";
import { publicApi } from "@/lib/api";
import { publicDatabase } from "@/lib/supabase";
import { authorFields } from "@/lib/public-catalog";
import { querySchema } from "@/lib/validation";
export async function GET(request: NextRequest) {
  return publicApi(request, async () => {
    const p = querySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    return {
      data: (
        await publicDatabase()
          .from("authors")
          .select(authorFields)
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("display_name")
          .range((p.page - 1) * p.pageSize, p.page * p.pageSize - 1)
          .throwOnError()
      ).data,
      page: p.page,
      pageSize: p.pageSize,
    };
  });
}
