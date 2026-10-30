import { NextResponse, type NextRequest } from "next/server";
import { sessionDatabase } from "@/lib/supabase";
import { siteUrl } from "@/lib/env";

// All OAuth accounts must already have an enabled administrative membership.
// A successful GitHub login must not imply OWNER/ADMIN or publish permissions.
export async function GET(request: NextRequest) {
  const fail = (reason: "link-invalid" | "email" | "access" | "service") =>
    NextResponse.redirect(new URL("/admin/login?reason=" + reason, siteUrl()), {
      headers: { "Cache-Control": "no-store" },
    });
  const code = request.nextUrl.searchParams.get("code");
  if (!code || code.length > 2048) return fail("link-invalid");
  try {
    const db = await sessionDatabase();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (error) return fail("link-invalid");
    const verified = await db.auth.getUser();
    if (verified.error || !verified.data.user) return fail("service");
    if (!verified.data.user.email_confirmed_at) {
      await db.auth.signOut({ scope: "local" }).catch(() => null);
      return fail("email");
    }
    const identity = await db.rpc("admin_identity");
    if (identity.error) return fail("service");
    if (
      !identity.data?.active ||
      !Object.keys(identity.data.permissions || {}).length
    ) {
      await db.auth.signOut({ scope: "local" }).catch(() => null);
      return fail("access");
    }
    return NextResponse.redirect(new URL("/admin", siteUrl()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return fail("service");
  }
}
