# Stage 5 baseline — 2026-10-18

Scope: production readiness, security, QA, responsive presentation, SEO and the versioned Android-facing API. This is the existing Next.js application; no replacement project or parallel publishing/RBAC engine was created.

## Evidence inspected

- Official repository `Mtzallqmy/Maystroon`, Stage 4 head `1fb4013944c274cc2c4c6166a5a1d922a9bbb15a`, draft PR #4; earlier stages remain stacked, unmerged changes.
- Stage 4 Actions run `38957124177` succeeded. Its result is historical, not evidence of a deployed service or of Stage 5 checks.
- Live Supabase `ttvasynaxkkcwrmvlorg`: migration history, public table RLS, function grants, Cron jobs, actual content and Auth user counts were queried.
- Vercel account's known workspace `team_1nD5GmV7KLAUeVvrLkVnbLAB`: scoped project query returns HTTP 403, including on the fresh October 18 check. No alternate team is used to bypass the restriction. No configured CLI credentials were available in the earlier fallback inspection.
- Railway Maystroon project `25a6dd10-8d50-497a-b17b-d555b5016709`, bot service `0e40bc57-4a78-408d-bf14-98970b69057c`: secrets were saved previously, but no bot deployment has been verified.

## Implemented versus externally activated

| Area                                     | Actual evidence                                                                 | Remaining acceptance                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Arabic public UI, CMS and control center | Existing routes/components and SQL permission/transaction tests                 | Real deployed browser flow                                                                   |
| Database                                 | 48 migrations applied; 6 categories, 0 posts                                    | Owner creates real editorial content                                                         |
| RLS                                      | No public table without RLS; service-only automation grants restricted          | Continue reviewing policies with every change                                                |
| Publishing                               | Existing transactional publishing service and minute Cron active                | Live editorial publish/restore/schedule with confirmed owner                                 |
| Owner identity/PIN                       | Secure bootstrap and PIN implementation present; 0 Auth users                   | Confirm actual Supabase identity and run restricted bootstrap, then set PIN                  |
| Telegram                                 | Account-link, updates, command and job schema applied; token stored on bot host | Deploy web gateway and worker, configure shared secrets/webhook, link verified administrator |
| AI                                       | Provider/RAG code and vector schema exist; database `enabled=false`             | Intentionally deferred by owner; no model/provider activation                                |
| SEO/API                                  | Existing metadata, sitemap, robots, JSON-LD and `/api/v1` contracts             | Production URL, shared-link checks and real endpoint smoke tests                             |
| Backups/performance                      | Existing policies and architecture                                              | No restore drill, load benchmark or production Core Web Vitals measurement is claimed        |

## Foundation repairs

The live database previously stopped partway through Stage 3/4. Remaining migrations were applied in dependency order. Expired connector request state was handled by inspecting the ledger and splitting SQL into smaller scoped migrations. Every split was compared byte-for-byte with the original concatenated SQL before removing superseded files. Source timestamps now match the actual live ledger, so an empty install and the managed database share the same ordered history.

No production test accounts, fake articles, default PIN or email-only ownership assignment were added. The public comment-options function is deliberately callable anonymously and returns only the allowlisted public policy projection. Administrative SECURITY DEFINER RPCs retain current database authorization inside the function; automation RPCs are service-role-only.

## Launch blockers

Vercel rejects the current connection's workspace access. The web host also needs its server-only Supabase key and independently generated PIN/rate-limit secrets. These values cannot be recovered from the available publishable-key API and must not be copied from unrelated projects. Without a verified web origin, the Telegram gateway cannot be activated safely. None of these blockers are treated as a successful launch.
