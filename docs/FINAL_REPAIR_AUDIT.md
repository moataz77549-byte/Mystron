# Final production recovery — verified baseline

Checked: 2026-10-19. Source: `moataz77549-byte/Mystron`, main at `54c69f015a58ec2224f5b0e91b07e1333f1d3df9`. This document describes a **read-only audit**, not a completed release.

## Verified current state

- GitHub: only `main` existed before the recovery branch. Two most recent `MAYSTROON CI` runs completed successfully on 2026-10-18. There were no GitHub releases or pull requests.
- Vercel: team `moataz77549-bytes-projects`, project `mystron` (`prj_wSmsdrRMlCR2zlMUTeYknVowFXHO`). Latest deployment `dpl_9qRWHKJzJG34mPiktcMsD4d9H3ML` reports **READY**, target `production`, via **redeploy**. Domain aliases include `mystron-henna.vercel.app` and `mystron-moataz77549-bytes-projects.vercel.app`. Vercel reports SSO protection enabled. **READY does not establish HTTP/API acceptance.**
- Vercel variable-name inventory (values intentionally not read or logged): `SUPABASE_SERVICE_ROLE_KEY`, `PIN_PEPPER`, `RATE_LIMIT_SECRET` and Telegram server secrets exist under **production**. The service-role key is **absent from preview**. The old deployment report claiming the key is absent from production is now outdated.
- Vercel Git deployment context: a **different** project, `mystron-bzgt`, has GitHub source linked to this repo. The intended `mystron` project was not listed as Git-linked. Do not silently replace or merge these projects.
- Railway: project `25a6dd10-8d50-497a-b17b-d555b5016709`, service `telegram-bot` (`0e40bc57-4a78-408d-bf14-98970b69057c`), with source `moataz77549-byte/Mystron` at the previous main commit. Service reports **live-with-staged-changes**, 16 pending changes and **no latest deployment**. No live Telegram operation is demonstrated.
- Supabase: `ttvasynaxkkcwrmvlorg` active, 48 migrations in live ledger, six categories, zero posts, zero `auth.users`, AI configuration disabled. **Owner Auth/PIN cannot pass live acceptance without confirmed authentication.**
- Supabase Security Advisors: 21 RLS-without-policy INFO notices (several intentionally private/service-only), one anonymous `public_comment_options()` SECURITY DEFINER WARN and 40 authenticated SECURITY DEFINER WARNs. These are review signals, **not** proof that all 41 functions are exploitable, nor proof they are safe.
- Backups: `docs/BACKUP_RECOVERY.md` explicitly reports no observed restore rehearsal.
- Public URL requests from available web retrieval were inaccessible; no independent successful deployed API response is claimed. Vercel recent runtime log query returned no entries; this is not a traffic or success guarantee.

## Concrete source defect corrected in this branch

`/api/v1/health` previously returned HTTP 200 if a server key merely **existed**, even when it could not authenticate a privileged Supabase query. The endpoint now tests a bounded **read-only** privileged query, returning HTTP 503 and `api=unavailable` for an invalid/unusable key. It neither runs privileged mutations nor returns upstream error bodies. Regression tests exercise the good, missing and invalid states.

## External blockers and rollout gates

1. Verify current Production endpoint status from an **authorized** browser/session; inspect logs if health is 503. Neither a variable-name listing nor READY is sufficient.
2. Production has **zero Auth users**. Complete owner email verification, trusted UUID-bound `private.bootstrap_owner`, then set PIN in authenticated app. No default credentials or email-only bootstrap.
3. Stage Telegram activation only after signed gateway and owner linking can be tested. Review and accept Railway staged changes before deploying; do not assume an existing domain is a running worker.
4. Keep `AI_ENABLED=false` and the AI provider inactive as requested.
5. Configure GitHub integration for **the intended** Vercel project, or a safe reviewed deployment pipeline. Separate `mystron-bzgt` from the public canonical target.
6. Review security advisor function grants and exercise live anon/authenticated/owner role tests; do not remove intentionally deny-all RLS.
7. Complete staging CMS E2E, media, Telegram and backup restore rehearsal before declaring production READY.

## Security and provenance

No secrets were exported or stored in this document. No production user, article, PIN or owner privilege was created. Historical Stage 1–5 reports remain available but must not be mistaken for current rollout acceptance.
