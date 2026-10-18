import type { NextRequest } from "next/server";
import { siteUrl } from "./env";
export function sameOrigin(request: NextRequest) {
  return request.headers.get("origin") === siteUrl().origin;
}
