import { NextResponse } from "next/server";
import { databaseConfigured } from "@/lib/env";
import { publicDatabase } from "@/lib/supabase";
export async function GET() {
  let database = "unconfigured";
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
  const apiConfigured = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.RATE_LIMIT_SECRET &&
    process.env.RATE_LIMIT_SECRET.length >= 32,
  );
  return NextResponse.json(
    {
      data: {
        service: "maystroon",
        version: "v1",
        database,
        api: apiConfigured ? "configured" : "unconfigured",
      },
    },
    {
      status: database === "ready" && apiConfigured ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
