export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};
export type Generation = {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
};
export type ProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  embeddingModel: string;
  timeoutMs: number;
  maxOutputTokens: number;
  streaming: boolean;
  allowTestHttp?: boolean;
};
export class AIError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export interface AIProvider {
  generate(messages: Message[], signal?: AbortSignal): Promise<Generation>;
  stream(messages: Message[], signal?: AbortSignal): AsyncGenerator<string>;
  embed(texts: string[], signal?: AbortSignal): Promise<number[][]>;
  healthCheck(): Promise<{ ok: boolean; models: number }>;
  listModels(): Promise<string[]>;
  getCapabilities(): {
    streaming: boolean;
    embeddings: boolean;
    protocol: string;
  };
}
async function boundedText(response: Response, max = 256000) {
  if (!response.body) throw new AIError("PROVIDER_INVALID_RESPONSE");
  const reader = response.body.getReader();
  let text = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > max) throw new AIError("PROVIDER_RESPONSE_TOO_LARGE");
      text += decoder.decode(part.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
const circuits = new Map<string, { failures: number; openUntil: number }>();
export class CompatibleProvider implements AIProvider {
  private circuit: { failures: number; openUntil: number };
  private base: string;
  constructor(
    private config: ProviderConfig,
    private transport: typeof fetch = fetch,
  ) {
    const url = new URL(config.baseUrl);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !(
        url.protocol === "https:" ||
        (config.allowTestHttp &&
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname))
      )
    )
      throw new AIError("PROVIDER_URL_INVALID");
    this.base = url.href.replace(/\/$/, "");
    const key = this.base + "|" + config.model;
    this.circuit =
      transport === fetch
        ? circuits.get(key) || { failures: 0, openUntil: 0 }
        : { failures: 0, openUntil: 0 };
    if (transport === fetch) circuits.set(key, this.circuit);
  }
  private async request(
    path: string,
    body?: unknown,
    signal?: AbortSignal,
    stream = false,
  ) {
    if (Date.now() < this.circuit.openUntil)
      throw new AIError("PROVIDER_BACKOFF");
    const timeout = AbortSignal.timeout(this.config.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const res = await this.transport(this.base + path, {
        method: body ? "POST" : "GET",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: combined,
        cache: "no-store",
      });
      if (!res.ok) {
        await res.body?.cancel();
        throw new AIError(
          res.status === 401 || res.status === 403
            ? "PROVIDER_AUTH_FAILED"
            : res.status === 404
              ? "PROVIDER_MODEL_UNAVAILABLE"
              : res.status === 429
                ? "PROVIDER_RATE_LIMITED"
                : "PROVIDER_UNAVAILABLE",
        );
      }
      if (stream) {
        this.circuit.failures = 0;
        return res;
      }
      const data = JSON.parse(await boundedText(res));
      this.circuit.failures = 0;
      return data;
    } catch (error) {
      if (++this.circuit.failures >= 3)
        this.circuit.openUntil = Date.now() + 30000;
      if (signal?.aborted) throw new AIError("CANCELLED");
      if (timeout.aborted) throw new AIError("PROVIDER_TIMEOUT");
      if (error instanceof AIError) throw error;
      throw new AIError("PROVIDER_INVALID_RESPONSE");
    }
  }
  async generate(
    messages: Message[],
    signal?: AbortSignal,
  ): Promise<Generation> {
    const data = await this.request(
      "/chat/completions",
      {
        model: this.config.model,
        messages,
        max_tokens: this.config.maxOutputTokens,
        stream: false,
      },
      signal,
    );
    const value = data.choices?.[0]?.message?.content;
    if (typeof value !== "string" || value.length > 50000)
      throw new AIError("PROVIDER_INVALID_RESPONSE");
    const input = data.usage?.prompt_tokens,
      output = data.usage?.completion_tokens;
    return {
      text: value,
      ...(Number.isInteger(input) && input >= 0 ? { inputTokens: input } : {}),
      ...(Number.isInteger(output) && output >= 0
        ? { outputTokens: output }
        : {}),
    };
  }
  async *stream(
    messages: Message[],
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    if (!this.config.streaming) throw new AIError("STREAM_UNSUPPORTED");
    const res = (await this.request(
      "/chat/completions",
      {
        model: this.config.model,
        messages,
        max_tokens: this.config.maxOutputTokens,
        stream: true,
      },
      signal,
      true,
    )) as Response;
    if (!res.body) throw new AIError("PROVIDER_INVALID_RESPONSE");
    const reader = res.body.getReader(),
      decoder = new TextDecoder();
    let pending = "",
      total = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 256000) throw new AIError("PROVIDER_RESPONSE_TOO_LARGE");
        pending += decoder.decode(value, { stream: true });
        let split;
        while ((split = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, split).trim();
          pending = pending.slice(split + 1);
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (raw === "[DONE]") return;
          let item;
          try {
            item = JSON.parse(raw);
          } catch {
            throw new AIError("PROVIDER_INVALID_RESPONSE");
          }
          const delta = item.choices?.[0]?.delta?.content;
          if (typeof delta === "string") yield delta;
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  async embed(texts: string[], signal?: AbortSignal) {
    if (!this.config.embeddingModel)
      throw new AIError("EMBEDDINGS_UNCONFIGURED");
    if (
      texts.length < 1 ||
      texts.length > 32 ||
      texts.some((t) => t.length > 8000)
    )
      throw new AIError("EMBEDDING_INPUT_TOO_LARGE");
    const data = await this.request(
      "/embeddings",
      { model: this.config.embeddingModel, input: texts },
      signal,
    );
    if (!Array.isArray(data.data) || data.data.length !== texts.length)
      throw new AIError("EMBEDDING_INVALID_RESPONSE");
    const sorted = [...data.data].sort((a, b) => a.index - b.index);
    let dimension = 0;
    return sorted.map((item, i) => {
      const v = item.embedding;
      if (
        item.index !== i ||
        !Array.isArray(v) ||
        v.length < 1 ||
        v.length > 4096 ||
        v.some((n) => typeof n !== "number" || !Number.isFinite(n)) ||
        !v.some((n) => n !== 0)
      )
        throw new AIError("EMBEDDING_INVALID_RESPONSE");
      if (dimension && dimension !== v.length)
        throw new AIError("EMBEDDING_DIMENSION_MISMATCH");
      dimension = v.length;
      return v as number[];
    });
  }
  async listModels() {
    const data = await this.request("/models");
    if (!Array.isArray(data.data))
      throw new AIError("PROVIDER_INVALID_RESPONSE");
    return data.data
      .slice(0, 500)
      .map((m: { id?: unknown }) => m.id)
      .filter(
        (id: unknown): id is string =>
          typeof id === "string" && id.length <= 200,
      );
  }
  async healthCheck() {
    const models = await this.listModels();
    return { ok: true, models: models.length };
  }
  getCapabilities() {
    return {
      streaming: this.config.streaming,
      embeddings: !!this.config.embeddingModel,
      protocol: "openai-chat-completions",
    };
  }
}
// Botkeep hosts a user-deployed API. It is not treated as an undocumented inference service.
export class BotKeepAdapter extends CompatibleProvider {}
