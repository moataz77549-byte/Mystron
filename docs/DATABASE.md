# Database

Migrations: legacy-retirement ledger, foundation, editorial Storage, removal of obsolete pg_net, Data API schema configuration, and optimized read policies. Created using Supabase CLI. Foundation can replay safely; seeds use conflict guards, policies/triggers are replaced, and existing owner closure is preserved. Apply ONLY to a dedicated/explicitly selected MAYSTROON database. Do not use unrelated existing projects.

## Relations

| Table           | Relations and access                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| profiles        | Auth UUID; own profile read only                                              |
| roles           | OWNER/ADMIN/EDITOR/AUTHOR names; public read                                  |
| user_roles      | Auth UUID + role UUID composite key; own roles read; assignment operator-only |
| categories      | Unique slug; ordered/active/deleted flags                                     |
| authors         | Optional profile; unique slug; public fields                                  |
| posts           | Author FK; status/visibility; publication scheduling; soft deletion           |
| post_categories | Composite join key; public only when both targets are visible                 |
| post_revisions  | Post/editor FKs; staff-only read; future snapshots                            |
| media_assets    | Owner FK; constrained type and size; no client writes                         |
| comments        | Post/user FKs; moderation statuses; disabled publicly                         |
| post_views      | Post FK; daily dedup hash; no client access or increments                     |
| site_settings   | Explicit is_public flag; private values blocked                               |
| ticker_items    | Active publication window and safe URL; ordered                               |
| audit_logs      | Actor FK; no client writes; minimal action metadata                           |

Every public/private table has RLS. Public content reads require published/public/not-deleted and publication date at or before now. Staff can read editorial tables through a private function that checks `auth.uid()` and database roles; never user metadata. AUTHOR currently receives only own identity/public content. Editorial writes are intentionally disabled until narrow policies in Stage 2.

`private.owner_bootstrap` locks a singleton and closes permanently. `private.account_pins` stores only peppered salted scrypt outputs. `private.rate_limits` serializes attempts with an atomic upsert and expires old entries. Private schema must not be exposed in Data API. Only service_role can call PIN/rate RPCs; bootstrap is SQL operator-only and revoked from service_role as well.

Storage: public `editorial` bucket limited to 5 MiB JPEG/PNG/WebP/AVIF. No upload policies. Published covers only; drafts must use a private bucket in the future. Database MIME checks do not prove file contents; the future upload pipeline must inspect magic bytes/decode/re-encode images before publishing. No SVG upload.

PGlite tests execute real PostgreSQL RLS and migrations against Auth/Storage schema fixtures. They do not test a deployed Supabase Auth/PostgREST/Storage service. Remote advisors and live smoke tests remain required after project selection.

Live verification on the selected project: 14 public application tables + 3 private tables; six categories, four role names, zero posts/users; all application tables have RLS. Old app/radio/api schemas are absent, cron jobs are zero, and only the editorial bucket remains. Anonymous REST reads succeed and direct write/role-read/privileged RPC attempts return permission-denied 42501. Security/performance advisors report no WARN/ERROR notices; private deny-all tables and initially unused indexes generate expected INFO notices.

Authenticated public/staff predicates share one read policy per table to avoid duplicate permissive-policy evaluation. Private-table lack of public policies is intentional deny-all, not a missing access grant. See https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy.

## Stage 3 migrations and live status

The source contains 19 additional ordered migrations. Two are recorded live: 20261015213017_control_01_admin_schema and 20261015213134_control_02_admin_default_grants. Seventeen remain unapplied after connector Invalid/expired requestState failures. Public/private new tables enable RLS immediately and revoke ordinary grants before later authorized policies/functions are installed. Do not infer full RBAC activation from the table catalog alone; admin_identity was absent in the last live verification. See STAGE_3_REPORT.md for exact activation status and DEPLOYMENT.md for the trusted remaining migration procedure.
