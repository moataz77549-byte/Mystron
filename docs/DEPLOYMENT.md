# Deployment

## Supabase

The owner explicitly retired the existing Fadhkur project and selected `ttvasynaxkkcwrmvlorg` for MAYSTROON. Its database is now migrated; dashboard name may still read Fadhkur. See SUPABASE_REPURPOSE_REPORT.md.

```sh
npx supabase login
npx supabase link --project-ref ttvasynaxkkcwrmvlorg
npx supabase db push
```

Never commit credentials. Use current CLI `--help`. After applying, run database advisors and verify RLS using anon/authenticated identities, then GET health/categories/posts with an empty database. Six categories and four role names are seeds; no articles/authors are invented.

## Environment

| Variable                             | Scope / purpose                                                     |
| ------------------------------------ | ------------------------------------------------------------------- |
| NEXT_PUBLIC_SUPABASE_URL             | Selected project URL                                                |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Public key; ANON_KEY compatibility accepted                         |
| SUPABASE_SERVICE_ROLE_KEY            | Server only; limited-use PIN and shared limiter RPCs                |
| NEXT_PUBLIC_SITE_URL                 | Exact canonical HTTPS origin; localhost only for development        |
| PIN_PEPPER                           | Server only; independent random secret, at least 32 characters      |
| RATE_LIMIT_SECRET                    | Server only; independent random HMAC secret, at least 32 characters |

Generate the last two separately using `openssl rand -hex 32`; store only in Vercel environment settings. Changing PIN_PEPPER requires users to reset existing PINs. Preview environments need their own canonical URL and should use a dedicated development database.

## Vercel

Import `Mtzallqmy/Maystroon`, Next.js preset, Node 24, default build `npm run build`, install `npm ci`, root `/`. Preview branch `stage-1-foundation`; production branch main. No production merge/deploy until checks and live database verification pass. A failed/unconfigured `/api/v1/health` is 503, never false-green.

No connected Vercel tool/credentials were available at implementation, so no remote deployment is claimed. BotKeep is not needed for Stage 1.

After deployment verify direct routes, API, mobile/desktop, empty states, session refresh/logout, verified owner authorization, authenticated reads, no drafts via public API and correct canonical sitemap/metadata. Owner bootstrap and email confirmation require real identity participation.

`supabase/config.toml` configures the optional local stack with no public signup, required email confirmation, no private schema exposure and no duplicate seed file. Hosted Auth settings must be configured separately in the selected project; db push does not apply Auth configuration.

## Current connection

**2026-10-18 update:** all 48 source migrations now match the live ledger and have been applied successfully. Stage 3/4 partial-schema notes below describe earlier checkpoints. See [Stage 5 report](STAGE_5_REPORT.md) for current verification and launch blockers. The Vercel connection is present but returns 403 for the intended team; no deployment URL has been verified.

The database project URL is in `.env.example` and `supabase/project.json`; keys are not committed. Local smoke checks used an ignored `.env.local` with the project's publishable key. Next.js service role, RATE_LIMIT_SECRET and PIN_PEPPER still require secure server environment configuration. Until then public database reads and pages work, but limited application API/auth actions fail closed. Health exposes database/API configuration separately and returns 503 unless both are ready.

Migration filenames match all 48 remote history versions. The first file is an audit ledger marker for a one-time teardown, deliberately a no-op for fresh installs; its actual reviewed destructive SQL is in operations and must never be run against the new platform. Subsequent migrations reproduce the new schema and policies. Supabase Edge function source uses Deno and is excluded from the Next.js TypeScript program.

## Stage 2 activation

Run the additional CMS, scheduler and policy-review migrations in order; their remote versions are recorded in STAGE_2_REPORT. The selected Supabase instance has pg_cron and active maystroon-publish-due/maystroon-retention jobs. Do not also schedule Vercel Cron unless a fallback is desired; both call the same idempotent engine, but redundant polling is unnecessary.

Set server-only SUPABASE_SERVICE_ROLE_KEY, RATE_LIMIT_SECRET (>=32 characters), PIN_PEPPER, and optional CRON_SECRET (>=32 characters) in Vercel settings. Public URL/publishable key are separate. Set NEXT_PUBLIC_SITE_URL to the exact preview/production origin because write routes validate Origin. The application does not retrieve service-role credentials through the available Supabase connector.

Check /api/v1/health, anonymous reads, login/role/PIN, media upload/download, comment/view rate limits, scheduled publication, direct routes and secret scan on the actual deployment. Verify hosting request limits before permitting maximum-size multipart upload. No Vercel connection or preview deployment was available in this session; importing the official repository and configuring environment settings remains manual. Do not interpret local build/fixture tests as a verified production URL.

## Stage 3 activation

Configure Auth allowed redirect URLs for the real origin: /auth/callback, /auth/confirm, /auth/complete and /invite (including invitation query parameter handling). Default Supabase invite/magic links may return URL fragments; the completion pages erase them and exchange them with a same-origin server route that validates getUser. If using PKCE/token-hash email templates, route the confirmation through /auth/confirm with an allowlisted type; preserve the application invitation token for /invite. Verify SMTP delivery and link behavior with a designated nonproduction recipient before inviting real administrators. Default SMTP/template capabilities depend on the actual Supabase plan and project creation date.

Set PIN_PEPPER independently of rate-limit/cron keys. Enable HTTPS so Auth/proof cookies are Secure. Bootstrap the confirmed owner UUID through the trusted operator procedure; Pending Setup must disappear only after it succeeds. Configure PIN from /admin/security before attempting sensitive owner operations. Recheck authenticated grants and real Storage/SMTP behavior before merging/deploying production.

The control-retention Cron is independent of content scheduling. Check cron.job_run_details for actual success; a configured schedule alone is not evidence of a successful backup or task run. Vercel Preview remains contingent on an available official repository integration and valid environment settings.

### Historical partial-schema checkpoint (resolved)

At the earlier connector failure, only control_01_admin_schema and control_02_admin_default_grants had been recorded live for Stage 3. This gap was resolved in Stage 5; inspect the current ledger before any further migration command.

After restoring an authorized Supabase connection, inspect the migration history first. A trusted operator may use the current CLI (credentials through its secure login/password flow, never chat or shell-history arguments):

```sh
npx supabase link --project-ref ttvasynaxkkcwrmvlorg
npx supabase db push --dry-run --skip-vault
npx supabase db push --skip-vault
```

Review the dry-run order and project ref before applying. No config.toml Vault values are needed for this project, so --skip-vault avoids unrelated secret changes. Do not repair/edit the ledger merely to mark unapplied SQL as complete. Recheck RLS/advisors, Auth identity, APIs, Storage and actual Cron execution afterward.

## Stage 4 activation

See STAGE_5_REPORT.md for the current live migration state; STAGE_4_REPORT.md describes an earlier checkpoint. All migrations and the limited security-grant hotfix are live. There is no verified Vercel Preview URL. Do not use migration repair to claim functions exist; inspect the actual ledger before applying further SQL.

Keep root `/` for Vercel. Configure the existing Supabase/public URL, service key, RATE_LIMIT_SECRET, PIN_PEPPER and canonical URL, then the server-only AI/Telegram variables listed in .env.example. AI_BASE_URL must come from actual provider documentation, never a guessed BotKeep endpoint. Both environment AI_ENABLED and database enabled policy are required. Never set MAYSTROON_TEST_FIXTURE/AI_ALLOW_TEST_HTTP in deployment.

The Python service needs a separate persistent HTTPS worker host and the repository-root Docker build context. See TELEGRAM_BOT.md and BOTKEEP_INTEGRATION.md. Vercel handles bounded requests only; the bot worker drives indexing/notifications through signed calls, and existing central publishing Cron remains the sole scheduler. Confirm database retention/digest Cron was actually installed before relying on it. Protect previews with isolated data, verify health/direct routes/mobile and run real linking/media/role/publishing/provider tests before production acceptance.

Repeated local builds exposed a Turbopack persistent-cache panic. The documented `turbopackFileSystemCacheForBuild: false` option disables build disk reuse; it does not disable application/public caching. Clean and repeated production builds must both pass.

## Release preflight

Run `npm run release:check` inside the securely configured web environment. For a local secret file, use `node --env-file=.env.local scripts/release-preflight.mjs`; never commit that file. Add `--telegram` when validating the bot/webhook variables. This release requires `AI_ENABLED=false` and no AI API key. The preflight validates configuration without displaying values; it does not replace a successful deployment, live database/owner/API checks, a Telegram webhook check or a restore drill.
