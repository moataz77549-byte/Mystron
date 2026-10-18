# Actual deployment map — 2026-10-19

## Canonical web (not yet fully accepted)

- Vercel team: `moataz77549-bytes-projects`.
- Intended project: `mystron`, ID `prj_wSmsdrRMlCR2zlMUTeYknVowFXHO`.
- Canonical domain currently registered: https://mystron-henna.vercel.app.
- Latest observed production deployment before recovery: `dpl_9qRWHKJzJG34mPiktcMsD4d9H3ML` — `READY`.
- Vercel Production environment lists the names of server-only Supabase, PIN, rate-limit and Telegram secrets. No values were exported. Public API/owner acceptance is not established.
- Deployment Protection is reported as SSO-enabled. Verify audience access before opening the website publicly.

## Git-linked preview (separate project)

- Vercel project: `mystron-bzgt`, ID `prj_NcGLJNQ8eAaREKi8EdVO4Iv5T8MU`.
- Linked GitHub: `moataz77549-byte/Mystron`.
- Initial branch build failed `NEXT_NO_VERSION`; the root/install/build settings were corrected.
- Successful recovery preview: `dpl_35LrqWqagm7C7zB1j6mfnJ6CwM7e` — `READY`, https://mystron-bzgt-4t6b38996-moataz77549-bytes-projects.vercel.app.
- This is **not** the canonical production project and has no validated isolated backend or owner Auth.

## Telegram worker

- Railway project: `Maystroon`, ID `25a6dd10-8d50-497a-b17b-d555b5016709`.
- Service: `telegram-bot`, ID `0e40bc57-4a78-408d-bf14-98970b69057c`.
- Production deployment: `7f2407e2-4bff-48cb-bdaf-b0df0e15ad71` — `SUCCESS` / `Online`.
- Service domain: https://telegram-bot-production-0524.up.railway.app.
- HTTP logs observed `POST /webhook` status 200. This does not verify admin-link RBAC or editorial workflows.

## Database

- Supabase: `ttvasynaxkkcwrmvlorg`, active.
- Migration ledger: 48. Categories: 6. Auth users: 0. Posts: 0.
- AI remains disabled. Real owner account activation and live editorial E2E are outstanding.

**Do not equate a Vercel READY build, CI fixture success or Telegram HTTP 200 with completed full-stack production acceptance.**
