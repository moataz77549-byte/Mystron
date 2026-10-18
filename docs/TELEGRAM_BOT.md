# Telegram editorial service

The existing Next.js app remains at the repository root. `services/telegram-bot` is a Python 3.12+ aiogram 3.31 gateway; business logic lives in `src/lib/telegram` and the existing CMS SQL commands. Shared contracts live in `packages/contracts`. There is no second publisher, scheduler or permission store.

## Run

Create a virtual environment, install `services/telegram-bot/requirements.lock`, then run `PYTHONPATH=services/telegram-bot python -m maystroon_bot`. For development checks install `requirements-dev.lock`; run `npm run test:python` and `npm run lint:python` with that environment active. Docker builds from repository root using `services/telegram-bot/Dockerfile`. `railway.json` supplies the Dockerfile/health configuration; no Railway deployment has been created.

Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_GATEWAY_SECRET, NEXT_PUBLIC_SITE_URL and TELEGRAM_WEBHOOK_URL in the bot host's secret settings. The last URL must be the actual HTTPS service URL ending `/webhook`. Bind address is 0.0.0.0; SERVER_PORT, then PORT, selects the listener port. Webhook mode is default; polling is explicitly opt-in and deletes the old webhook. Startup configures the Telegram webhook with its secret. `/health` returns degraded until the actual signed backend probe succeeds. Shutdown cancels work and closes HTTP/Bot clients.

Also set the bot token, username and independent webhook/gateway secrets on the web host. Never send these through chat, repository issues or commits. No default production token or URL exists.

## Link and operate

After confirmed Auth login and trusted owner bootstrap, open `/admin/telegram`. Generate a five-minute, single-use link and open the bot in a private chat. The link is bound to the verified originating Auth session. Expired/revoked sessions require fresh login and linking. Unlinking invalidates administrative access and pending deliveries.

Arabic inline menus provide posts/status/search/category/author filters, durable new-post steps, draft/review/publish actions, title/excerpt/category/author/image edits, unpublish/archive/scheduling, comments, statistics, notifications, preferences, AI suggestions and web settings links. Text can arrive in multiple messages or a UTF-8 `.txt` file; image content is decoded and size-checked before Storage upload. Draft workflow state survives process restarts for seven days. Cancel explicitly ends that workflow. Categories/authors are selected from real records; their full CRUD remains in the existing web studio.

Publishing calls the central CMS service. AUTHOR cannot publish. Every update/callback rechecks current membership, session, permissions and category scope; times display Asia/Aden and persist UTC. Publish requires a confirmation callback. No final-delete command exists. Notification preferences support event types, priorities, quiet hours and a daily digest.

## Delivery and recovery

Webhook acknowledges only after durable ingestion. Unique update IDs and database receipts prevent duplicate CMS operations; fenced leases protect work. Retries are bounded to five failures with backoff, then dead-letter status and an administrative notification. Outbox sends recheck link, permissions, post scopes and authorization fingerprint. A lost network acknowledgment can duplicate a Telegram message; this is not an exactly-once delivery guarantee. It does not duplicate database publication.

Production Telegram transport is not verified: BotFather credentials and a running HTTPS host are absent. Fixture tests are not evidence of a live bot.
