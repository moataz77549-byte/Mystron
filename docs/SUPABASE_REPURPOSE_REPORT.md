# Supabase repurpose report — 2026-10-14 (Asia/Aden)

Owner explicitly authorized removing the old Fadhkur project content and reusing it for MAYSTROON. Target ref: ttvasynaxkkcwrmvlorg. Other Supabase projects were not changed.

## Completed

- Preflight: 100 application tables/views, 9 Edge functions, 2 cron jobs, 3 physically empty buckets, 0 Auth users and 0 Vault secrets.
- Replaced all 9 old Edge bodies with a no-import/no-environment/no-network 410 FUNCTION_RETIRED response; JWT verification enabled. Function records remain because the connected tool has no delete operation.
- Atomically removed old app/radio/private/api schemas and non-extension public application objects, unscheduled both cron jobs, reset old migration history. Supabase-managed Auth/Storage schemas were retained. Auth had no accounts to remove.
- SQL attempted bucket deletion was rejected by Supabase's managed guard and rolled back; the revised database teardown omits bucket deletion. No managed guard/trigger was bypassed.
- Deleted the three old buckets through the actual Storage API using a temporary nonce-gated maintenance body on the existing health endpoint. Only SHA-256 of the random nonce was embedded; the service key stayed inside Edge environment and was never returned or saved. The endpoint was then restored to the retired 410 body and temporary nonce files removed.
- Applied new foundation/Storage migrations, removed obsolete pg_net, fixed authenticator Data API schema exposure to public/graphql_public, optimized SELECT policies and added bootstrap FK index.
- Generated TypeScript database types and aligned repository migration versions with remote history. The destructive teardown is preserved in an operations file; normal migrations contain a no-op audit ledger for that completed operation.

## Live checks

Six categories and four roles; zero posts/users; zero old app/radio/api schemas and cron jobs; only editorial Storage bucket. All 17 application tables have RLS. Anonymous public reads return 200; anonymous post INSERT, user_roles SELECT and service-only RPC return 401/42501. No test articles were published. Advisor WARN/ERROR counts are zero; expected INFO notices concern deliberately inaccessible private tables and unused indexes in a fresh database.

## Remaining limitations

- Old Edge records/previous deployment versions cannot be permanently deleted by the connected plugin. Their current code is retired, but this is not claimed as full control-plane deletion. Dashboard/Management API access is required to delete them and inspect/remove any legacy custom function secrets. Managed logs/backups are not erased by schema teardown.
- No Vercel deployment or server role/pepper/rate-secret configuration has occurred. Public page reads can connect; protected application API/auth actions fail closed until server configuration is supplied. Health reflects that incomplete readiness.
- Owner email confirmation, explicit UUID bootstrap and PIN setup remain incomplete. Dashboard project name still Fadhkur unless renamed through management access.
- Stage 2 not started, main not merged.

Operator teardown source: supabase/operations/retire_fadhkur.sql. It aborts if the original marker is absent or new Auth/Storage data appears. NEVER run it against the repurposed platform.

## Repository validation

Production build and lint passed with the live database configuration. Four opt-in Playwright cases passed (two cases each on desktop/mobile) against actual Supabase-backed pages, including six categories and server-protected admin redirect. The normal six unconfigured-foundation browser cases run separately in CI; live smoke tests are opt-in and skipped in CI. Thirteen Vitest cases exercise the full ordered migration chain with Auth/Storage fixtures, RLS, PIN and mocked API contracts.

All nine legacy endpoints were HTTP-checked with a valid legacy anonymous JWT and returned 410 FUNCTION_RETIRED. JWT validation alone is not the shutdown mechanism: the retired bodies themselves perform no operations. A fresh server early redirect in proxy prevents delayed streaming redirects while layout/action role checks remain in force. Request-scoped React caching deduplicates home data reads.
