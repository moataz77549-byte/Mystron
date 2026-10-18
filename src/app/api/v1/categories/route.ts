import type { NextRequest } from "next/server";
import { publicApi } from "@/lib/api";
import { categories } from "@/lib/content";
export async function GET(request: NextRequest) {
  return publicApi(request, async () => {
    return { data: await categories() };
  });
}
