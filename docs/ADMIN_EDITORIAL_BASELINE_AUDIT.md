# Admin/editorial baseline — 2026-10-19

Repository: moataz77549-byte/Mystron. Base: main `7114ed5241dd75bc9e8cc90631b787defc51947a`. Work branch: fix-admin-editorial-publishing-overhaul.

PR #1 is merged. final-production-recovery has no commits missing from main; its health regression tests and readiness fix are retained. Previous local deployment notes were checkpointed separately before checking out current main. They are not used as authority for today's state.

## Direct observations

- Supabase ttvasynaxkkcwrmvlorg: 48 migrations, six categories, zero posts, one confirmed Auth user. Exactly one active OWNER; enabled all-category membership; one-time bootstrap closed; PIN present. Existing identity and credentials are preserved.
- One Telegram link exists and six link requests were recorded in the queried preceding day. A link record alone does not establish current session validity or a successful publishing command.
- No public table lacks RLS. No production DML was performed for this audit.
- Railway telegram-bot: deployment 7f2407e2-4bff-48cb-bdaf-b0df0e15ad71 SUCCESS; no pending patch. This supersedes earlier approval-blocked notes.
- Canonical Vercel project is mystron, prj_wSmsdrRMlCR2zlMUTeYknVowFXHO. mystron-bzgt is separate and must not be used for this task's preview. Production names include required Supabase/PIN/Telegram secrets; values were not exported. Preview has public database credentials but no privileged production key.
- There is no Supabase development branch. Paid branching is not silently provisioned. Isolated SQL/Auth-protocol/Storage tests are explicitly distinguished from real hosted Auth/Storage acceptance.
- npm ci completed successfully. New test results will be recorded separately; previous CI results are historical evidence, not proof of this branch.

## Feature classification at baseline

| Area                                    | Status            | Evidence / work required                                                                                                                                                           |
| --------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity/RBAC/PIN/owner lock            | WORKING           | Confirmed live membership/bootstrap/PIN inventory; existing SQL authorization tests. Do not change owner. Current browser session still needs authorized acceptance.               |
| Session expiry / auth callback feedback | NEEDS IMPROVEMENT | Callback failures silently redirect and login combines distinct failures. API routes do not all refresh cookies in proxy.                                                          |
| Password recovery                       | MISSING           | No complete user-facing recovery/reset flow in current routes.                                                                                                                     |
| Admin navigation                        | NEEDS IMPROVEMENT | Flat list; no grouped sections, search/status shortcuts or proper mobile focus trap.                                                                                               |
| Dashboard                               | INCOMPLETE        | Real counters exist; no editorial empty-state CTA, recent posts or upcoming schedule composition.                                                                                  |
| Create/edit/revision/publish            | WORKING           | Existing central CMS RPCs and version checks; final current-branch integration run pending.                                                                                        |
| Autosave/offline recovery               | NEEDS IMPROVEMENT | Browser draft and epoch tracking exist. No explicit offline/reconnect retry; raw errors; recovery is not surfaced on load; in-app navigation is unguarded.                         |
| Tiptap basic formatting/preview         | WORKING           | Existing editor and server JSON validator/HTML sanitizer; no second editor needed.                                                                                                 |
| Literary/research blocks                | INCOMPLETE        | Generic poetry/callout/footnote containers exist, but no structured attribution or hemistich editing.                                                                              |
| Posts manager                           | INCOMPLETE        | Search/status and bulk actions exist; English state labels, no author/category/date/order filters or rich rows; inconsistent local filtering.                                      |
| Publishing engine                       | WORKING           | Existing transactional/versioned SQL, audit, reindex jobs and Cron; do not duplicate. APPROVED should be compatible editorial decision, not a destructive status enum replacement. |
| Schedule UI                             | NEEDS IMPROVEMENT | UTC storage/Aden editor input exist. Queue orders by updated_at, copied review text is misleading, errors are raw.                                                                 |
| Categories/authors                      | WORKING           | Existing safe CRUD/redirect/relationship checks. Improve forms and optional editorial metadata without conflating author and Auth user.                                            |
| Central tag management                  | MISSING           | Posts have text-array tags; no merge/rename administration. Reuse existing data model.                                                                                             |
| Media crop/upload/templates             | WORKING           | Existing Sharp validation, Supabase storage, crop, image presets and metadata. Improve pagination/display/presets and error feedback.                                              |
| Home/menu/site settings                 | WORKING           | Existing versioned settings service and public rendering. Improve discoverability and visual composition rather than create another settings store.                                |
| Comments/moderation/reports             | NEEDS IMPROVEMENT | Moderation and policies exist; reports need a usable dedicated queue.                                                                                                              |
| Telegram link errors                    | BROKEN            | Client catches every error and shows one message; HTTP 429 lacks Retry-After; server maps unrelated errors through AI handler; no expiry or consumption feedback.                  |
| Telegram worker                         | WORKING           | Real Railway SUCCESS observed; current privileged command acceptance remains unverified.                                                                                           |
| Public reading/SEO                      | WORKING           | Existing server-rendered reader, metadata, sitemap, sanitizer and isolated editor bundle; structured blocks need matching rendering.                                               |
| AI                                      | WORKING           | Disabled configuration retained; isolated tests only, no external paid calls.                                                                                                      |
| Backup restore                          | INCOMPLETE        | Documentation exists, no verified hosted restore rehearsal.                                                                                                                        |

## Acceptance boundaries

Do not seed production, impersonate the owner's Auth session, bypass PIN/RLS, copy production secrets to Preview, merge main or replace Production. Exercise writes in the isolated staging test harness first. Hosted staging and real Telegram consumption require a separately configured nonproduction backend and authorized user session. A passing SQL fixture is not described as live Supabase Auth/Storage success.

## تحديث المتابعة — 2026-10-21

هذا تدقيق خط الأساس التاريخي. الحالة المحدثة بتاريخ 2026-10-21 في ADMIN_OVERHAUL_AUDIT.md، والنتائج والقيود في ADMIN_OVERHAUL_TEST_REPORT.md وPRODUCTION_ACCEPTANCE.md.
