// Isolated HTTP protocol fixture. This is NOT a deployed AI integration.
import { createServer } from "node:http";
createServer(async (req, res) => {
  const json = (code, value) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
  };
  if (req.url === "/health") return json(200, { fixture: true });
  if (req.headers.authorization !== "Bearer fixture-only-ai-key")
    return json(401, { error: "invalid_key" });
  if (req.url === "/v1/models")
    return json(200, {
      data: [{ id: "fixture-generation" }, { id: "fixture-embedding" }],
    });
  const buffers = [];
  for await (const chunk of req) buffers.push(chunk);
  const input = JSON.parse(Buffer.concat(buffers).toString() || "{}");
  if (req.url === "/v1/embeddings")
    return json(200, {
      data: input.input.map((_, i) => ({ index: i, embedding: [1, 0, 0] })),
    });
  if (req.url !== "/v1/chat/completions") return json(404, {});
  let text = "مرحباً بك في ما يسطرون.";
  try {
    const context = JSON.parse(input.messages.at(-1).content);
    text = context.sources
      ? JSON.stringify({
          claims: context.sources.length
            ? [
                {
                  text: "يعرض النص أفكاراً عن المعرفة والقراءة.",
                  source: 1,
                  quote: context.sources[0].text.slice(0, 100),
                },
              ]
            : [],
        })
      : "اقتراح تحريري للاختبار والمراجعة البشرية.";
  } catch {
    /* Connection-test plain prompt. */
  }
  if (input.stream) {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const mid = Math.floor(text.length / 2);
    for (const content of [text.slice(0, mid), text.slice(mid)])
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
      );
    return res.end("data: [DONE]\n\n");
  }
  return json(200, {
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 120, completion_tokens: 40 },
  });
}).listen(54332, "127.0.0.1");
