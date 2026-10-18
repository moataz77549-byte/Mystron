# AI providers

AIProvider offers generate, stream, embed, healthCheck, listModels and getCapabilities. CompatibleProvider supports the explicitly configured chat-completions protocol, optional SSE, model listing and embeddings. BotKeepAdapter uses that same configurable protocol only when an actual deployed endpoint supports it. It does not infer a BotKeep URL or assume unsupported capabilities. No official OpenAI key is required.

Set AI_BASE_URL to the documented HTTPS API base, AI_API_KEY server-side, AI_MODEL and optional AI_EMBEDDING_MODEL. AI_TIMEOUT is milliseconds (bounded 1000–30000); AI_MAX_OUTPUT_TOKENS is an environment ceiling. Database model/provider policy is selected in `/admin/ai/settings` and may override model defaults. AI_STREAMING_SUPPORTED=true is an operator assertion after protocol verification. A missing embeddings model leaves keyword retrieval available. Missing/disabled generation reports a clear unavailable state.

Base URLs reject embedded credentials, query/fragment and HTTP in production. The isolated browser test fixture requires BOTH MAYSTROON_TEST_FIXTURE=true and AI_ALLOW_TEST_HTTP=true to permit loopback HTTP only. Never set either in hosting environments; this switch changes provider transport only and never bypasses Auth/RBAC.

Model responses are size/time bounded; embeddings must be finite, nonzero, consistently dimensioned and indexed correctly. Model/provider/base-URL namespaces prevent mixing different embedding spaces. Read dimensions from successful vectors; do not assume a model dimension.

The model list may be empty if unsupported; an operator can enter a documented identifier. Connection tests perform real generation against the configured endpoint and consume a tracked quota reservation. Current tests use isolated deterministic fixtures, not real BotKeep/model credentials. Automatic fallback-model selection is not implemented.
