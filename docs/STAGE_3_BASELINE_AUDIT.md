# Stage 3 baseline audit — 2026-10-14

Verified base: Stage 2 commit 68965274307ada162a78783ee4fdc6fe4edd7c80, PR #2 (stacked on Stage 1), GitHub MAYSTROON CI run 38630622746 succeeded. Local source tree matched the remote tree. Main/Stage 1/Stage 2 were inspected; neither draft PR was merged. The new branch builds on the tested Stage 2 implementation.

Actual checks: 38 Vitest/PostgreSQL integration tests; two desktop/mobile workflows with local Auth/Storage protocol fixtures and real migrations/RLS; six unconfigured public-browser checks; production build, TypeScript/lint, browser secret scan and production dependency audit (zero reported vulnerabilities). Fixture tests do not prove live identity ownership or deployment.

Live Supabase: eleven recorded migrations (six foundation plus advanced_cms/editorial_scheduler/cms_policy_review/public_sharing_preferences/editorial_controls); six categories; no production fixture articles or Auth users. Private editorial image bucket, RLS, current publication engine and two Cron jobs are present. A real publish-due Cron execution succeeded on the empty database. Auth.sessions metadata columns were inspected before designing session UI.

Working implementation includes post CRUD/revisions/autosave, Arabic Tiptap, private images/crop/templates, transactional publishing/scheduling, public authors/categories, moderated guest comments, daily view aggregation, Arabic token search, SEO/public APIs and ticker/article ads. Public images/comments/rate-limited APIs still require deployment server secrets.

Gaps: four coarse roles, no permission matrix/category scopes/invitations/disabled-admin mechanism, PIN setup but no enforced sensitive proof, placeholder users/settings pages, no audit browser/notifications/settings/menu/maintenance/control-center analytics. Existing tables/services will be extended, not duplicated.

Security findings to fix: role-name checks cannot express granular grants; active JWTs need database membership/revocation checks; PIN must gate actual database mutations, including direct RPC calls; settings require typed allowlists and owner-only security keys; immutable audit must omit secrets. Public view functions already use INVOKER/RLS. Existing authenticated SECURITY DEFINER write RPC notices are intentional but must be re-reviewed after authorization changes.

External blockers remain: no confirmed owner Auth UUID/bootstrap, no deployed server secrets or Vercel connection. Supabase dashboard browser login required a user-performed Google password change; no successful dashboard session was claimed. Nine retired Edge records/old versions, custom secret review and display-name cleanup remain outside completed SQL retirement. No production acceptance or ownership readiness is inferred from documentation.

Decisions: central database permissions plus own/all resource scope; reuse roles/user_roles and add active assignment metadata; administrative membership/category-scope rows; compare verified JWT session/issuance with database revocation state; hashed one-use invitation tokens; peppered scrypt PIN with shared backoff and short session-bound proof; owner-only security/role controls. Public configuration is separately validated, and unsupported integration/backup data stays explicitly unavailable. No Stage 4 integration bot is implemented.
