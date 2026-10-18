import "server-only";
import { createHmac } from "node:crypto";
import { privilegedDatabase } from "./supabase";
export async function rateLimit(key: string, limit = 60, seconds = 60) {
  if (
    !process.env.RATE_LIMIT_SECRET ||
    process.env.RATE_LIMIT_SECRET.length < 32
  )
    throw new Error("RATE_LIMIT_UNAVAILABLE");
  const hashed = createHmac("sha256", process.env.RATE_LIMIT_SECRET)
    .update(key)
    .digest("hex");
  const { data, error } = await privilegedDatabase().rpc("consume_rate_limit", {
    p_key: hashed,
    p_limit: limit,
    p_seconds: seconds,
  });
  if (error) throw error;
  return data === true;
}
