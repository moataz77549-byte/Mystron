import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { privilegedDatabase } from "@/lib/supabase";
import { failure } from "@/lib/api";
import { revalidatePath, revalidateTag } from "next/cache";
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const token = req.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (!secret || secret.length < 32) return failure("CRON_NOT_CONFIGURED", 503);
  if (
    token.length !== expected.length ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  )
    return failure("UNAUTHORIZED", 401);
  try {
    const { data, error } = await privilegedDatabase().rpc("run_due_posts");
    if (error) throw error;
    revalidateTag("public-content", { expire: 0 });
    revalidatePath("/", "layout");
    return NextResponse.json({ data });
  } catch {
    return failure("PUBLISHING_FAILED", 503);
  }
}
