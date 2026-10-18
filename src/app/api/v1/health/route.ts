import { NextResponse } from "next/server";
import { databaseConfigured } from "@/lib/env";
import { privilegedDatabase, publicDatabase } from "@/lib/supabase";

// Public health is deliberately read-only and never exposes credentials or upstream errors.
export async function GET() {
  let database: "unconfigured" | "unavailable" | "ready" = "unconfigured";
  if (databaseConfigured()) {
    try {
      const { error } = await publicDatabase()
        .from("categories")
        .select("id")
        .limit(1);
      database = error ? "unavailable" : "ready";
    } catch {
      database = "unavailable";
    }
  }

  const serverConfigured = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.RATE_LIMIT_SECRET &&
    process.env.RATE_LIMIT_SECRET.length >= 32,
  );
  let api: "unconfigured" | "unavailable" | "ready" = "unconfigured";
  if (serverConfigured && databaseConfigured()) {
    try {
      // A present key is not necessarily valid: confirm the privileged
      // connection used by API rate limiting can actually reach the database.
      const { error } = await privilegedDatabase()
        .from("categories")
        .select("id")
        .limit(1);
      api = error ? "unavailable" : "ready";
    } catch {
      api = "unavailable";
    }
  }
  return NextResponse.json(
    { data: { service: "maystroon", version: "v1", database, api } },
    {
      status: database === "ready" && api === "ready" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
