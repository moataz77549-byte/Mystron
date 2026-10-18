import { NextResponse, type NextRequest } from "next/server";
import { sameOrigin } from "@/lib/origin";
import { sessionDatabase } from "@/lib/supabase";
import { cookies } from "next/headers";
import { failure } from "@/lib/api";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return failure("FORBIDDEN", 403);
  await (await sessionDatabase()).auth.signOut();
  (await cookies()).delete("maystroon-proof");
  return NextResponse.redirect(new URL("/admin/login", request.url), 303);
}
