import type { NextRequest } from "next/server";
import { publicApi } from "@/lib/api";
import { publicMenus } from "@/lib/control/navigation";
export async function GET(request: NextRequest) {
  return publicApi(request, async () => ({ data: await publicMenus() }));
}
