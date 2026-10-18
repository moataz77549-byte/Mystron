# Integration control

integration_settings holds six fixed providers: supabase, vercel, telegram, botkeep, ai, analytics. Only enabled, label and non-secret note are accepted. Arbitrary keys such as token/api_key are rejected by both application and database. No secret is returned after saving because no secret is accepted by this UI. Use Vercel environment settings or an appropriate secret manager with least privilege and rotation.

Only Supabase has an implemented connection check: an actual public categories query, timestamped at request time. Vercel/Telegram/BotKeep/AI/analytics are explicitly unconfigured pending supported credentials and Stage 4 integration. A saved enabled flag is not represented as a successful connection. This stage does not implement a Telegram bot, BotKeep client or AI content generation.

Required server configuration remains SUPABASE_SERVICE_ROLE_KEY, RATE_LIMIT_SECRET, PIN_PEPPER and CRON_SECRET; only NEXT_PUBLIC_SUPABASE_URL, publishable/anon key and NEXT_PUBLIC_SITE_URL are public. No real secret is committed in .env.example. An existing Supabase connection does not imply access to Vercel environment settings or deployed runtime secrets.
