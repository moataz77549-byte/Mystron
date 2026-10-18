# Telegram security

Only private chats with matching sender/chat IDs are accepted. The webhook validates Telegram's secret header before durable ingestion; it does not treat a username or Telegram ID as administrative proof. Telegram limits/metadata are validated with Pydantic, aiogram and strict Zod contracts.

Account links use 32 random bytes, store SHA-256 only, expire in five minutes, are single-use and are bound to a confirmed Supabase Auth session. The gateway hashes raw linking codes before durable update storage. There is no PIN/password entry through Telegram. Linked identity is delegated only inside service-only SQL wrappers using trusted stored identity; user_metadata is never authorization. Existing RBAC and canonical CMS functions enforce each operation.

The separate web gateway uses HMAC-SHA256 over timestamp, nonce, exact path and body hash; timestamp tolerance is 30 seconds. Nonces are recorded for ten minutes and reject replay. Gateway and webhook secrets are independent, at least 32 characters, server-only. Requests use HTTPS and do not follow redirects. Logs contain fixed error codes, not tokens, payloads or upstream exception strings.

Every delivery checks current link/session, required permission, post IDs and an authorization fingerprint. Revocation, disabling membership and unlinking suppress stale private output. Retries have leases and limits; ambiguous external sends can be duplicated. Keep both Telegram and web clocks synchronized.

New tables use RLS and explicit grants. Public visitors cannot call actor delegation, consume tokens, ingest updates, read drafts or mutate counters. Uploaded files are decoded, MIME/size checked and saved to the existing private bucket. Untrusted SVG/executable files are rejected. Bot replies use plain text rather than HTML/Markdown interpretation.

Retain draft/update/delivery records up to seven days; clear processed update payloads and sent delivery bodies immediately. Daily retention must actually run in the deployed database. Audit events remain under the existing audit policy. Telegram itself processes messages under its own terms; do not link public groups.
