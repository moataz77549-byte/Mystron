# AI architecture

`packages/ai` defines the provider contract and grounding/chunking logic. `packages/contracts` owns strict request/settings types. Server-only `src/lib/ai` handles configuration, quota reservations, retrieval, usage, public-source checks and summary caching. Next route handlers expose JSON and validated SSE; Python Telegram editorial actions invoke the same AI service. Editor results are proposals for manual application and cannot publish.

AI requires BOTH AI_ENABLED=true in the web environment and enabled database configuration. Disabling it leaves ordinary search, reading and CMS operational. Public widgets lazy-load the chat/Markdown code. There are no chat transcripts stored in the platform; browser entries live only in component memory. Each question is independent, with optional current-post context; multi-turn semantic memory is not implemented.

The service retrieves at most six bounded passages, asks the provider for structured claims with exact supporting quotes, verifies source IDs/quotes/URLs, removes arbitrary links/HTML, then rechecks current publication and source versions before responding. No administrative tools are exposed. This reduces fabricated attribution; exact quotation checks do not prove every model inference is semantically correct. Documents and questions are untrusted data. Medical output requires human verification.

Provider streaming is parsed with bounded UTF-8/SSE handling and cancellation. Output is buffered until grounding and final publication checks succeed, then a verified `answer` SSE event is emitted. This deliberately does not show unverified token-by-token text. There is a 1–30 second per-provider timeout and a three-failure circuit breaker with 30-second cooldown per process. No automatic retries of unknown billable generation calls occur.

Summary cache keys include post/version/provider/base-URL/model/type; publication changes synchronously invalidate entries. Long-article summaries currently cover retrieved excerpts, not guaranteed full-document hierarchical summaries, and the UI states that limit. Related-article search and the optional semantic search button use retrieval without generating new prose. Existing keyword/filter/pagination search remains independent.

Administrative settings/model/usage/index pages use existing database RBAC and owner-sensitive PIN checks for configuration changes. Secrets are never accepted in database settings and remain in host environment settings. Actual external provider activation is pending credentials and provider-specific contract verification.
