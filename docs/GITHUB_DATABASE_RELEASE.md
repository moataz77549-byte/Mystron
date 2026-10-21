# Supabase release via GitHub Actions

Target: `ttvasynaxkkcwrmvlorg`; branch `fix-admin-editorial-publishing-overhaul`; PR #4.
No Supabase Pro, cloud branch, replacement database, or additional scheduler is used.

## Operator setup required

The connected GitHub tool cannot create environment protection rules or write encrypted
GitHub Secrets. Configure these directly in repository **Settings → Environments**:

1. `maystroon-db-backup`
2. `maystroon-db-production`

For **both** environments, enable **Required reviewers**, select the authorized owner,
disable administrator bypass, and restrict deployments to the work branch. If the
owner is the only reviewer, do not prohibit self review. Environment names alone do
not provide protection: the script checks the run's recorded review history and
refuses to proceed without a human approval.

Add the following **environment secrets to both environments** with identical values:

| Secret                      | Value entered privately in GitHub                                                |
| --------------------------- | -------------------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`     | Supabase personal access token authorized for the existing project               |
| `SUPABASE_DB_PASSWORD`      | Current database password; no password reset is required                         |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing project's server-only service role key, used for private Storage backup |
| `BACKUP_ENCRYPTION_KEY`     | Base64 representation of 32 cryptographically random bytes                       |

Generate the encryption key locally, for example with `openssl rand -base64 32`.
Keep a second offline copy in the owner's password manager. Never paste credentials
into issues, pull requests, chat, workflow inputs, or logs.

Set the **repository Actions variable** `MAYSTROON_DB_RELEASE_SHA` to the complete,
reviewed work branch commit SHA. An empty or different value keeps both production
jobs skipped. Review the workflow and scripts before arming a revision.

The workflow runs automatically on branch pushes. After configuring the variable,
use **Actions → MAYSTROON database release → the push run for that SHA → Re-run all
jobs**. Re-running must include the entire dependency chain, not the apply job alone.
Approve `maystroon-db-backup` when requested. Review the successful restore/dry-run
job before separately approving `maystroon-db-production`. GitHub controls release
of environment secrets. Approval-history verification is an additional fail-closed
check, not a replacement for environment protection.

`workflow_dispatch` is also defined, but GitHub only registers its manual Run workflow
button once the workflow exists on the default branch. Do not merge the application
early solely to expose that button. The branch push/re-run path avoids that bootstrap.
If GitHub does not reevaluate a previously skipped job's variable in a re-run, do not
weaken the gate: register this workflow alone on main through a separately reviewed
workflow-only PR, then dispatch the existing work branch revision.

## Execution and safety gates

`docker-acceptance` runs without production secrets on `ubuntu-latest`. It starts the
real Supabase stack on a dedicated Docker bridge with outbound connections blocked by an explicit firewall rule, applies the existing 49 files,
asserts their ledger identities, then applies exactly six pending files. A transactional
SQL suite exercises real Postgres roles/RLS, session enforcement, author/category
metadata, post saves and stale-version rejection, tag merging, review/approval,
publishing, unpublishing, scheduling/cancellation, and versioned static pages.
Test rows are rolled back. The same job then builds Next.js with local-only credentials and runs Chromium against real local Auth, Storage and PostgreSQL: login, session listing, catalog forms, editor save/reload/publish, tags/reports access, static page saves, origin/access denial, and five screen widths. These are isolated tests and do not constitute hosted production acceptance.

Before applying the six files, the secret-free job also rehearses CLI dump/restore
on its disposable baseline, including an actual Auth account/password and a Storage
object. Its destructive reset has both `--local` and an isolated temporary workdir;
the production path never calls reset. This rehearsal validates the tooling, and
does **not** replace the separate production-backup restore gate.

The protected backup job links CLI 2.120.0 to the fixed project using environment
secrets, reads the 49-entry ledger, and verifies all public tables retain RLS. It
exports roles, schema, data (COPY), and the migration ledger, and downloads the
actual bytes of every registered Storage object. It checks metadata/object inventory
counts and database row fingerprints before and after backup. Concurrent writes
cause a stop; arrange a quiet maintenance window and rerun rather than accepting
an inconsistent backup.

Cron job definitions and available execution history are included in the encrypted
dump. Row comparisons exclude Auth/Storage's service-owned migration bookkeeping
and volatile Cron execution history, while retaining all application/user data and
Cron definitions. The actual application migration ledger is explicitly backed up,
restored and compared. Vault currently has zero secrets; if that changes, preflight
stops and requires a separate verified Vault-key recovery procedure.

The archive is encrypted with AES-256-GCM and a fresh random nonce. Ciphertext is
split into 16 MiB parts and stored in a private bucket named
`maystroon-private-release-backups` **inside the current Supabase project**. The bucket
is created only after the database/source Storage backup is captured. Existing backup
archives are excluded from recursive source inventory. Object names and row hashes
remain inside encrypted data. No backup, SQL dump, storage file, or restore trace is
uploaded as an Actions artifact, committed to git, or emitted to logs. This uses the
project's existing free Storage quota: insufficient quota stops release without
applying migrations. Do not delete old archives automatically to make space.

The job downloads the durable encrypted copy, checks chunk/manifest hashes, decrypts,
and restores it into a fresh isolated local stack using `ON_ERROR_STOP` and a single
transaction. It verifies original row fingerprints, restores Storage bytes through
the local Storage API, downloads them again, and compares SHA-256 hashes. Local cron
execution is disabled before import; the outbound firewall prevents restored jobs
from calling production. A managed Auth/Storage schema version mismatch causes a stop;
the workflow does not omit incompatible COPY blocks to conceal lost data.

Next, the six files run locally, ledger count must become 55, and SQL acceptance runs.
The production `supabase db push --dry-run --linked --skip-vault` output must contain
exactly the six filenames in order. No `--include-all`, seeds, role push, linked reset,
or migration repair is permitted. Vault settings are not pushed.

After the separate production approval, the apply job requires successful normal CI
for the same SHA and confirms it is still the work branch head. It re-downloads the
same authenticated backup (maximum age 24 hours), checks that production still
matches its original fingerprints, repeats ledger/dry-run checks, and executes the
single existing CLI migration engine. A failure stops immediately; there is no
continue-on-error or automatic down migration. Postchecks require 55 exact ledger
entries, unchanged original columns/rows, and public RLS. Only the six migrations'
documented additive permission/membership seed rows may be added to existing tables.

## Six-file allowlist

| File                                             | Purpose                                  |
| ------------------------------------------------ | ---------------------------------------- |
| `20261020211511_editorial_tag_management.sql`    | Scoped tag listing and atomic merging    |
| `20261020211520_comment_report_workflow.sql`     | Authorized report moderation and audit   |
| `20261021014512_editorial_catalog_metadata.sql`  | Category color and author specialty      |
| `20261021014741_self_service_admin_sessions.sql` | Own session listing/revocation           |
| `20261021015741_editorial_approval_decision.sql` | Approval bound to exact content version  |
| `20261021015841_site_pages_management.sql`       | Versioned, permission-gated static pages |

## Recovery and completion

The encrypted bucket retains each run/attempt archive. The run's backup job outputs
identify its prefix and authenticated manifest digest; preserve these with the run URL.
Restore rehearsals are always local. The script does not provide a production reset
or bulk restore command. If a migration partly succeeds, leave the real ledger intact,
inspect which committed, and prepare a reviewed forward repair. Any production restore
requires a separate approved maintenance procedure; preserve current data first.

After a successful database run, complete PR #4 review, CI and authorized merge. Confirm
the deployment is in Vercel project `mystron` (`prj_wSmsdrRMlCR2zlMUTeYknVowFXHO`),
with the correct production Supabase configuration and AI disabled. Test the deployed
admin login/session, editor save/recovery, tags, reports, authors, categories, approval,
publication, and static pages using an authorized account. Do not declare browser,
backup, migration, merge, or deployment success from a prepared workflow alone.
