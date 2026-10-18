# BotKeep integration status

Official hosting documentation inspected: https://botkeep.cloud/docs/hosting (16 October 2026). It documents Python applications/workers, environment variables, 0.0.0.0 binding, SERVER_PORT and HTTPS domains. It does not establish an LLM inference API base URL or an OpenAI-compatible model contract. A successful deployment operation must be followed by runtime/health verification.

Consequently, this repository implements a configurable adapter without a fabricated endpoint. Before enabling it, obtain the actual deployed provider API specification, model IDs, authentication header, supported chat/stream/embedding paths, response shape, limits and privacy/retention terms. Configure secrets at the host; run model listing, a real generation, timeout/error and embedding tests. Verify actual vector dimensions before indexing.

The Python bot can be hosted only where the documented runtime, persistent worker, HTTPS ingress and secret settings are available. Its Dockerfile and port configuration are ready for that deployment. No BotKeep hosting account, inference endpoint, credentials or successful deployment was available here. Local fixture success proves only our protocol implementation.
