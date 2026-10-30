import { NextResponse } from "next/server";
import { databaseConfigured, publicEnv, siteUrl } from "@/lib/env";
import { sessionDatabase } from "@/lib/supabase";

// OAuth uses the SSR PKCE client, which retains its verifier in secure cookies.
// GitHub accounts are NEVER granted application roles by this endpoint.
export async function GET() {
  const errorPage = new URL("/admin/login?reason=oauth", siteUrl());
  if (!databaseConfigured()) return NextResponse.redirect(errorPage);
  try {
    const db = await sessionDatabase();
    const { data, error } = await db.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: new URL("/auth/callback", siteUrl()).href },
    });
    if (error || !data.url) return NextResponse.redirect(errorPage);
    const authorization = new URL(data.url);
    const configured = new URL(publicEnv().url);
    // Only the configured Supabase project's authorize endpoint is trusted.
    if (
      authorization.origin !== configured.origin ||
      authorization.pathname !== "/auth/v1/authorize" ||
      !["https:", "http:"].includes(authorization.protocol)
    ) return NextResponse.redirect(errorPage);
    return NextResponse.redirect(authorization, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.redirect(errorPage);
  }
}
