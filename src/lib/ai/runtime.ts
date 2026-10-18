import { createHash } from "node:crypto";
import "server-only";
import {
  CompatibleProvider,
  BotKeepAdapter,
  AIError,
  type AIProvider,
} from "../../../packages/ai/provider";
import { aiSettings, type AISettings } from "../../../packages/contracts/ai";
import { privilegedDatabase } from "../supabase";
export async function configuration() {
  const { data, error } = await privilegedDatabase()
    .from("ai_configuration")
    .select("*")
    .single();
  if (error || !data) throw new AIError("AI_CONFIGURATION_UNAVAILABLE");
  const {
    singleton: _singleton,
    version,
    updated_at: _updated,
    ...values
  } = data;
  void _singleton;
  void _updated;
  return { ...aiSettings.parse(values), version: Number(version) };
}
export function provider(settings: AISettings): AIProvider {
  if (process.env.AI_ENABLED !== "true" || !settings.enabled)
    throw new AIError("AI_DISABLED");
  const apiKey = process.env.AI_API_KEY,
    baseUrl = process.env.AI_BASE_URL,
    model = settings.model || process.env.AI_MODEL;
  if (!apiKey || !baseUrl || !model) throw new AIError("AI_UNCONFIGURED");
  const config = {
    apiKey,
    baseUrl,
    model,
    embeddingModel:
      settings.embedding_model || process.env.AI_EMBEDDING_MODEL || "",
    timeoutMs: Math.min(
      30000,
      Math.max(1000, Number(process.env.AI_TIMEOUT) || 20000),
    ),
    maxOutputTokens: Math.min(
      settings.max_output_tokens,
      Number(process.env.AI_MAX_OUTPUT_TOKENS) || 4096,
    ),
    streaming:
      settings.streaming && process.env.AI_STREAMING_SUPPORTED === "true",
    allowTestHttp:
      process.env.AI_ALLOW_TEST_HTTP === "true" &&
      (process.env.NODE_ENV !== "production" ||
        process.env.MAYSTROON_TEST_FIXTURE === "true"),
  };
  return settings.provider === "botkeep"
    ? new BotKeepAdapter(config)
    : new CompatibleProvider(config);
}
export async function status() {
  if (process.env.AI_ENABLED !== "true")
    return {
      enabled: false,
      configured: false,
      streaming: false,
      reason: "AI_DISABLED",
    };
  try {
    const config = await configuration();
    const client = provider(config);
    return {
      enabled: true,
      configured: true,
      streaming: client.getCapabilities().streaming,
      reason: null,
    };
  } catch (error) {
    return {
      enabled: false,
      configured: false,
      streaming: false,
      reason: error instanceof AIError ? error.code : "AI_UNAVAILABLE",
    };
  }
}

export function embeddingModelKey(settings: AISettings) {
  const model =
    settings.embedding_model || process.env.AI_EMBEDDING_MODEL || "";
  return `${model.slice(0, 100)}@${settings.provider}:${createHash("sha256")
    .update(JSON.stringify([process.env.AI_BASE_URL || "", model]))
    .digest("hex")
    .slice(0, 24)}`;
}
