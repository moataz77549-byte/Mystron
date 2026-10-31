# Publishing and production deployment

The canonical source is `moataz77549-byte/Mystron`, branch `main`.
The production Vercel project is `mystron` (`prj_wSmsdrRMlCR2zlMUTeYknVowFXHO`), in team `moataz77549-bytes-projects`.
The public site and shared Android API use https://mystron-henna.vercel.app.

## Release workflow

1. Complete and validate changes before updating `main`.
2. Vercel's Git integration should create a production deployment for each update to `main`.
3. Confirm the deployment belongs to `mystron`, has the intended Git commit SHA, reaches `READY`, and receives the public domain alias.
4. Check `/api/v1/health`: both `database` and `api` must be `ready`. A successful build alone is not an acceptance check.
5. Do not create another database or replace the existing Supabase project (`ttvasynaxkkcwrmvlorg`).

## Publishing behavior

The editor saves outstanding changes before requesting a publication transition. It reports progress, then confirmed success and a link to the published article. Failed transitions must remain errors; they must not display a success notice.

Public data reads use a short shared cache. Successful CMS mutations, publishing cron calls and settings changes immediately expire the public content tag. Administrative sessions and write responses remain private. Supabase RLS and server-only credentials remain required.

Vercel functions use `sin1`, near the existing Supabase database. Document statistics and heading scans are debounced while typing; browser draft recovery and optimistic version checks remain enabled.

## Validation of the performance fix

Commit `0e354cadd21dc48ad5788e523c9d5a5395d14a93` passed 179 unit/database/API tests, five desktop browser flows, and the mobile publishing flow. The mobile test first caches the draft's public 404, publishes it, opens the article, then unpublishes it and verifies a public 404 again. TypeScript, ESLint, Prettier and the browser secret boundary also passed.

Timing measurements must distinguish TLS/network connection time from application response time; do not present a single measurement as a universal latency guarantee.
