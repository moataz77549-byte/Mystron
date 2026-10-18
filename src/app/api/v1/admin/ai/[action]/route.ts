import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { aiFailure, aiSubject, aiCookie } from "@/lib/ai/http";
import { configuration, provider, status } from "@/lib/ai/runtime";
import { editorialSuggestion, testProvider } from "@/lib/ai/service";
import {
  aiSettings,
  editorialInput,
} from "../../../../../../../packages/contracts/ai";
import { sameOrigin } from "@/lib/origin";
import { failure } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
export const maxDuration = 60;
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const action = (await params).action;
    const identity = await requirePermission(
      action === "usage" ? "analytics.read" : "integrations.manage",
    );
    if (!(await rateLimit("ai-admin:" + identity.user.id, 60, 60)))
      return failure("RATE_LIMITED", 429);
    let data;
    if (action === "providers") {
      const config = await configuration();
      data = {
        selected: config.provider,
        status: await status(),
        providers: [
          { id: "compatible", label: "OpenAI-compatible API" },
          { id: "botkeep", label: "واجهة مستضافة على BotKeep — إعداد صريح" },
        ],
        capabilities: {
          streaming: process.env.AI_STREAMING_SUPPORTED === "true",
          embeddings: !!(
            config.embedding_model || process.env.AI_EMBEDDING_MODEL
          ),
        },
      };
    } else if (action === "models")
      data = { models: await provider(await configuration()).listModels() };
    else if (["settings", "usage", "index-status"].includes(action)) {
      const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(10000)
        .parse(req.nextUrl.searchParams.get("page") || 1);
      const result = await identity.db.rpc("ai_admin_overview", {
        p_action: action === "index-status" ? "knowledge" : action,
        p_page: page,
      });
      if (result.error) throw new Error("AI_UNAVAILABLE");
      data = result.data;
    } else return failure("NOT_FOUND", 404);
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "private,no-store" } },
    );
  } catch (error) {
    return aiFailure(error);
  }
}
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  if (!sameOrigin(req)) return failure("INVALID_ORIGIN", 403);
  try {
    const action = (await params).action;
    const identity = await requirePermission(
      action === "editorial" ? "posts.update" : "integrations.manage",
    );
    if (!(await rateLimit("ai-command:" + identity.user.id, 10, 60)))
      return failure("RATE_LIMITED", 429);
    const raw = await req.text();
    if (raw.length > 15000) return failure("PAYLOAD_TOO_LARGE", 413);
    const input = JSON.parse(raw || "{}");
    let data;
    if (action === "settings") {
      const parsed = z
        .object({ settings: aiSettings, version: z.number().int().positive() })
        .strict()
        .parse(input);
      const result = await identity.db.rpc("ai_admin_settings", {
        p_value: parsed.settings,
        p_version: parsed.version,
      });
      if (result.error)
        throw new Error(
          [
            "PIN_VERIFICATION_REQUIRED",
            "PIN_SETUP_REQUIRED",
            "VERSION_CONFLICT",
            "FORBIDDEN",
          ].find((c) => result.error.message.includes(c)) || "AI_UNAVAILABLE",
        );
      data = { saved: true };
    } else if (action === "reindex") {
      z.object({}).strict().parse(input);
      const result = await identity.db.rpc("ai_reindex");
      if (result.error)
        throw new Error(
          ["PIN_VERIFICATION_REQUIRED", "PIN_SETUP_REQUIRED", "FORBIDDEN"].find(
            (c) => result.error.message.includes(c),
          ) || "AI_UNAVAILABLE",
        );
      data = { queued: result.data };
    } else if (["test", "editorial"].includes(action)) {
      const { subject, token } = aiSubject(req, identity.user.id);
      data =
        action === "test"
          ? await testProvider(subject, req.signal)
          : await editorialSuggestion(
              editorialInput.parse(input),
              subject,
              req.signal,
            );
      return aiCookie(
        NextResponse.json(
          { data },
          { headers: { "Cache-Control": "private,no-store" } },
        ),
        token,
      );
    } else return failure("NOT_FOUND", 404);
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "private,no-store" } },
    );
  } catch (error) {
    return aiFailure(error);
  }
}
