import { maintenanceResponse } from "./lib/control/maintenance";
import { publicConfiguration } from "./lib/control/settings-service";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { databaseConfigured, publicEnv } from "./lib/env";
export async function proxy(request: NextRequest) {
  if (!databaseConfigured()) return NextResponse.next();
  const path = request.nextUrl.pathname;
  const exempt =
    path.startsWith("/admin") ||
    path.startsWith("/auth") ||
    path.startsWith("/invite") ||
    path.startsWith("/api/v1/admin") ||
    path.startsWith("/api/v1/invitations") ||
    path.startsWith("/api/v1/internal/automation/") ||
    path === "/api/v1/health" ||
    path.startsWith("/api/cron") ||
    path.startsWith("/api/v1/cron/") ||
    path === "/maintenance";
  if (!exempt) {
    const { maintenance, identity } = await publicConfiguration();
    if (
      maintenance.enabled &&
      (!maintenance.until || new Date(maintenance.until) > new Date())
    ) {
      const paused = path.startsWith("/api/")
        ? NextResponse.json({ error: { code: "MAINTENANCE" } }, { status: 503 })
        : maintenanceResponse(identity.name, maintenance.message);
      paused.headers.set("Retry-After", "3600");
      paused.headers.set("Cache-Control", "no-store");
      return paused;
    }
  }
  if (!path.startsWith("/admin") && !path.startsWith("/auth"))
    return NextResponse.next();
  let response = NextResponse.next({ request });
  const { url, key } = publicEnv();
  const db = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, {
            ...options,
            httpOnly: true,
            secure:
              process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://") ?? false,
          }),
        );
      },
    },
  });
  const {
    data: { user },
  } = await db.auth.getUser();
  if (
    request.nextUrl.pathname.startsWith("/admin") &&
    request.nextUrl.pathname !== "/admin/login" &&
    (!user || !user.email_confirmed_at)
  ) {
    const redirect = NextResponse.redirect(
      new URL("/admin/login", request.url),
    );
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:woff2?|png|jpg|jpeg|webp|avif|gif|css|js)$).*)",
  ],
};
