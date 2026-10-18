import { NextRequest, NextResponse } from "next/server";
import { sessionDatabase } from "@/lib/supabase";
import { siteUrl } from "@/lib/env";
export async function GET(req: NextRequest) {
  const token_hash = req.nextUrl.searchParams.get("token_hash");
  const type = req.nextUrl.searchParams.get("type");
  if (
    token_hash &&
    token_hash.length < 1024 &&
    ["invite", "email", "recovery"].includes(type || "")
  ) {
    const result = await (
      await sessionDatabase()
    ).auth.verifyOtp({
      token_hash,
      type: type as "invite" | "email" | "recovery",
    });
    if (!result.error) {
      const token = req.nextUrl.searchParams.get("token");
      const target = new URL(
        token && /^[\w-]{43}$/.test(token) ? "/invite" : "/admin/account",
        siteUrl(),
      );
      if (token && /^[\w-]{43}$/.test(token))
        target.searchParams.set("token", token);
      return NextResponse.redirect(target);
    }
  }
  return NextResponse.redirect(new URL("/admin/login", siteUrl()));
}
