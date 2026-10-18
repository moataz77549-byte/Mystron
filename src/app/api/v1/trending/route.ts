import { NextRequest } from "next/server";
import { publicApi } from "@/lib/api";
import { trending } from "@/lib/public-catalog";
import { z } from "zod";
export async function GET(req: NextRequest) {
  return publicApi(req, async () => ({
    data: await trending(
      z.coerce
        .number()
        .int()
        .min(1)
        .max(30)
        .parse(req.nextUrl.searchParams.get("days") || 7),
      z.coerce
        .number()
        .int()
        .min(1)
        .max(50)
        .parse(req.nextUrl.searchParams.get("limit") || 10),
    ),
  }));
}
