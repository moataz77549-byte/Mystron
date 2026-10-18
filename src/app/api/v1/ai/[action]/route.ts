import { NextRequest, NextResponse } from "next/server";
import {
  chatInput,
  searchInput,
  summaryInput,
} from "../../../../../../packages/contracts/ai";
import { answerQuestion, summarize, searchKnowledge } from "@/lib/ai/service";
import { status } from "@/lib/ai/runtime";
import { aiSubject, aiCookie, aiFailure } from "@/lib/ai/http";
import { sameOrigin } from "@/lib/origin";
import { failure } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
export const maxDuration = 60;
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  if ((await params).action !== "status") return failure("NOT_FOUND", 404);
  return NextResponse.json(
    { data: await status() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  if (req.headers.has("origin") && !sameOrigin(req))
    return failure("INVALID_ORIGIN", 403);
  if (Number(req.headers.get("content-length") || 0) > 12000)
    return failure("PAYLOAD_TOO_LARGE", 413);
  try {
    const available = await status();
    if (!available.enabled)
      return failure(available.reason || "AI_DISABLED", 503);
    const raw = await req.text();
    if (raw.length > 6000) return failure("PAYLOAD_TOO_LARGE", 413);
    const action = (await params).action;
    if (!["chat", "summarize", "search"].includes(action))
      return failure("NOT_FOUND", 404);
    const input = JSON.parse(raw);
    const { subject, token } = aiSubject(req);
    if (!(await rateLimit("ai:" + subject.visitor, 6, 60)))
      return failure("RATE_LIMITED", 429);
    const data =
      action === "chat"
        ? await answerQuestion(chatInput.parse(input), subject, req.signal)
        : action === "search"
          ? await searchKnowledge(searchInput.parse(input), subject, req.signal)
          : await summarize(summaryInput.parse(input), subject, req.signal);
    // Grounding and the final publication/version check finish before any model output is exposed.
    const response =
      input.stream && available.streaming
        ? new NextResponse(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    `event: answer\ndata: ${JSON.stringify({ data })}\n\n`,
                  ),
                );
                controller.close();
              },
            }),
            {
              headers: {
                "Content-Type": "text/event-stream;charset=utf-8",
                "Cache-Control": "no-store",
                "X-Accel-Buffering": "no",
                "X-Request-ID": data.request_id,
              },
            },
          )
        : NextResponse.json(
            { data },
            {
              headers: {
                "Cache-Control": "no-store",
                "X-Request-ID": data.request_id,
              },
            },
          );
    return aiCookie(response, token);
  } catch (error) {
    return aiFailure(error);
  }
}
