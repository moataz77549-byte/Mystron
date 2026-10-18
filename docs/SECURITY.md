# Security

## Identity and owner

1. In the selected Supabase project's trusted dashboard, create/invite mtzallqmy@gmail.com with email confirmation enabled and normal password authentication. User must complete the provider's verification. Configure SMTP/allowed redirects and `/auth/callback` as needed; confirmation URL handling depends on the chosen invitation/confirmation template.
2. A trusted operator independently verifies that the confirmed UUID belongs to the intended owner. Email match is a guard, never an automatic role assignment.
3. In SQL Editor, run `select private.bootstrap_owner('VERIFIED_UUID'::uuid);`. No web bootstrap endpoint exists. Function is inaccessible to anon/authenticated/service_role, locks state, checks confirmation and expected email, assigns OWNER and closes. An explicit database operator remains the trust boundary.
4. Login `/admin/login`, then set a 6–12 digit PIN in `/admin/account` with current password reauthentication. There is no default PIN. PIN is a secondary secret foundation; it is not enabled as standalone login or claimed to be MFA.

Admin layouts validate `auth.getUser()` remotely, confirmed email, and actual database roles. Every action validates independently. Account/email-only matching and user_metadata authorization are forbidden. No signup or role-management public endpoints.

PIN uses HMAC-SHA256 with an independent server pepper, then scrypt N=32768,r=8,p=1, random 16-byte salt and constant-time verifier. Shared account limiter allows 5 setup attempts per 15 minutes. Login limiter allows 5 requests per trusted connection per 15 minutes, in addition to provider Auth throttles. There is no PIN verification endpoint yet; add shared account attempt limits before enabling one.

Public API uses 60 requests/minute and service-only transactional limiter. Requires RATE_LIMIT_SECRET and service_role server configuration; fails closed on limiter failure. Vercel overwrites `x-vercel-forwarded-for` at the trusted edge; direct/untrusted deployments collapse to a common local bucket and need equivalent trusted ingress. Do not trust caller-supplied forwarded headers on a different host. Public Supabase direct reads remain protected by RLS but do not share the application API limiter.

Mutations check exact Origin against NEXT_PUBLIC_SITE_URL. Auth cookies are refreshed in proxy and private/no-store. Static CSP is not applied blindly: a future nonce CSP must support Next.js hydration. Security headers include nosniff, DENY framing, strict referrer and restricted permissions.

No public writes in Stage 1. post_views has no direct public write/read and no counting endpoint, so view metrics and most-read sections are not shown. Content HTML is never injected; JSON-LD escapes `<`. Cover optimization accepts only selected Supabase editorial paths. Secrets remain server-only, logs do not contain passwords/PINs, no tokens are committed.

Before production: remote migration/advisors, SMTP and confirmed owner verification, HTTPS canonical URL, privileged RPC checks, dependency review, backup policy and provider log retention settings.

## Stage 2 security review

All new tables have RLS; private contact emails/visitor hashes/revisions are not exposed through public application repositories. Anonymous select grants on posts are limited to publication fields. Public aggregate view functions are SECURITY INVOKER and rely on published-post RLS. The public image proxy checks publication-linked RLS metadata before privileged Storage download; it validates path namespace, bytes and MIME, serves image-only content with nosniff/no-store, and never accepts SVG.

CMS writes intentionally use SECURITY DEFINER to perform atomic revisions, associations, audit and publishing without granting direct client mutation. Each callable command checks confirmed auth.uid and database roles. AUTHOR writes are limited to owned draft/unpublished posts; publishers are OWNER/ADMIN/EDITOR; publishing settings require OWNER/ADMIN. Actor IDs are server-derived. RPC patch allowlists reject ownership/status/counter injection. Functions use an empty search_path. The service-only view/comment/cron RPCs are revoked from anon/authenticated.

Supabase advisors flag authenticated SECURITY DEFINER RPCs even when their explicit authorization is intentional. This is a review signal, not a reason to grant direct table writes or disable RLS. See [Supabase RPC advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Private no-policy tables are deliberate deny-all ([advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). Unused indexes are expected in an empty site. Media/revision overlapping read policies were merged ([advisor](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies)). The report records remaining notices rather than claiming all notices disappeared.

Editor documents have byte/node/depth limits and an explicit node/mark allowlist. Rendering escapes text and sanitizes output; only HTTP/HTTPS links, generated media IDs and approved youtube-nocookie embeds render. Public pages regenerate safe markup from JSON and never trust content_html directly. Comment names/body render as text. Exact Origin is required on cookie mutations. Server secrets use server-only modules and are scanned out of browser bundles.

Browser tests use a clearly isolated local fixture, not a production authentication bypass. No fixture conditional exists in application authorization. Real Supabase ownership remains unverified until a confirmed Auth UUID is inspected and bootstrapped by a trusted operator. No default PIN, password or email-only ownership elevation was created. Live authenticated security tests must precede production activation.

## Stage 3 controls

See OWNER_SECURITY.md and RBAC_PERMISSIONS.md. getUser + database session/permission lookup replace coarse role checks. Live-post edits and transitions require publishing rights; a bare update grant cannot unpublish content. Disabled memberships and revoked session IDs block subsequent administrative RPC/API access even after JWT refresh. Category scope is checked inside SQL for content and delegation. Invitations are confirmed-email, locked, expiring and one-use. Public users cannot read token hashes, proofs, PIN hashes, comment contacts, blocklists or integration settings.

Control API writes enforce exact configured Origin, strict schemas and persistent rate limits. Server-rendered pages and SQL commands independently authorize access. Audit tables have no ordinary mutation grants. CSV exports neutralize spreadsheet formulas. Menu/advertisement destinations are validated; no executable ad snippets/CSS/JS are supported. Maintenance excludes recovery surfaces. Failures never expose raw SQL messages to control API clients.

Supabase Auth invitation/magic email delivery and real MFA must be verified on deployment; local simulated Auth is not evidence of either. Password, PIN or secret values must never be put in diagnostic metadata. Fixed PIN failure stage/error-class logs contain no submitted value.

## Stage 4 controls and current live gap

See TELEGRAM_SECURITY.md, AI_PRIVACY.md, AI_USAGE_LIMITS.md and STAGE_4_REPORT.md. Service-only gateway RPCs bind every Telegram action to a current verified Auth session; HMAC/nonce validation, update receipts and fenced outbox leases protect transport. No public chat tools or administrative model actions exist. Sources are rechecked for publication and version before returning grounded output; model citations cannot supply arbitrary URLs.

Prompt injection defenses are layered constraints, not a proof of model obedience or factual correctness. UI rendering rejects executable Markdown/HTML. Private editorial text is opt-in and permission checked. Secret values remain in host settings and are scanned from browser bundles. Exact quote matching proves a quote exists in a retrieved passage, not that every model inference is sound.

On 16 October the anonymous EXECUTE privileges on admin_update_setting and owner_setup_state were revoked live and independently verified. Full pending control/automation migrations still require completion and live session/RLS checks. The final advisors show 21 authenticated SECURITY DEFINER findings and seven intentional private deny-all RLS notices; do not declare the live database fully audited or production ready.
