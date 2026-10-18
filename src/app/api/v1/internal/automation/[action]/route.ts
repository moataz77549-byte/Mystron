import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyGateway, linkHash } from "@/lib/telegram/security";
import { telegramUpdate } from "../../../../../../../packages/contracts/telegram";
import { privilegedDatabase } from "@/lib/supabase";
import { automationWork } from "@/lib/telegram/automation";
import { failure } from "@/lib/api";
export const maxDuration = 60;
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  if (Number(req.headers.get("content-length") || 0) > 100000)
    return failure("PAYLOAD_TOO_LARGE", 413);
  const raw = await req.text();
  if (raw.length > 100000) return failure("PAYLOAD_TOO_LARGE", 413);
  if (
    !verifyGateway(
      req.headers,
      req.nextUrl.pathname,
      raw,
      process.env.TELEGRAM_GATEWAY_SECRET,
    )
  )
    return failure("UNAUTHORIZED", 401);
  try {
    const db = privilegedDatabase();
    const nonce = await db.rpc("automation_nonce", {
      p_hash: linkHash(req.headers.get("x-maystroon-nonce")!),
    });
    if (nonce.error) throw new Error();
    if (!nonce.data) return failure("REPLAY_REJECTED", 409);
    const action = (await params).action;
    const data = JSON.parse(raw || "{}");
    let result;
    if (action === "updates") {
      const update = telegramUpdate.parse(data),
        message = update.callback_query?.message || update.message,
        sender = update.callback_query?.from || update.message?.from;
      if (!message || !sender || sender.is_bot || message.chat.id !== sender.id)
        return failure("PRIVATE_CHAT_REQUIRED", 400);
      if (update.message?.text) {
        const rawCode = update.message.text.trim();
        const code =
          /^\/start ([a-f0-9]{64})$/.exec(rawCode)?.[1] ||
          (/^[a-f0-9]{64}$/.test(rawCode) ? rawCode : null);
        if (code) update.message.text = "/link " + linkHash(code);
      }
      const value = await db.rpc("telegram_ingest", {
        p_update_id: update.update_id,
        p_telegram_id: sender.id,
        p_payload: update,
      });
      if (value.error) throw new Error();
      result = { accepted: true, new: value.data };
    } else if (action === "work") {
      z.object({}).strict().parse(data);
      result = await automationWork();
    } else if (action === "ack") {
      const body = z
        .object({
          id: z.uuid(),
          lease: z.uuid(),
          message_id: z.number().int().nullable(),
          error: z.enum(["TELEGRAM_DELIVERY_FAILED"]).nullable().optional(),
        })
        .strict()
        .parse(data);
      const value = await db.rpc("telegram_ack_delivery", {
        p_id: body.id,
        p_lease: body.lease,
        p_message_id: body.message_id,
        p_error: body.error || null,
      });
      if (value.error) throw new Error();
      result = { acknowledged: true };
    } else if (action === "health") {
      z.object({}).strict().parse(data);
      const value = await db
        .from("automation_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "dead");
      if (value.error) throw new Error();
      result = { database: true, dead_jobs: value.count };
    } else return failure("NOT_FOUND", 404);
    return NextResponse.json(
      { data: result },
      { headers: { "Cache-Control": "private,no-store" } },
    );
  } catch (error) {
    return failure(
      error instanceof z.ZodError || error instanceof SyntaxError
        ? "INVALID_INPUT"
        : "AUTOMATION_UNAVAILABLE",
      error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503,
    );
  }
}
