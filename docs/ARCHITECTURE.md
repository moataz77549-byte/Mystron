# Architecture

Next.js App Router + strict TypeScript. Server Components render published editorial content. Client islands handle navigation, theme, ticker pause, login and PIN forms. Supabase is accessed through a server-only repository, with separate anonymous, session and service clients. Public pages use the anonymous client even when an administrator is signed in, preventing drafts leaking through shared HTML.

`src/lib/content.ts`: content reads and filters. `auth.ts`: verified user and database role lookup. `api.ts`: JSON/error boundary. `validation.ts`: Zod. `rate-limit.ts`: transactional shared limits. `pin.ts`: peppered scrypt. API v1 returns data independent of HTML for a future native Kotlin Android application.

Latest npm stable dist-tags were inspected at implementation; ESLint 9 and TypeScript 6 were selected for current plugin compatibility. Dependencies are exact-pinned with a lockfile. React Hook Form and Zod are in use. TanStack Query and Tiptap are deferred because Stage 1 has no client-side editorial data cache or rich editor; installing unused frameworks adds no functional value.

No duplicated backend, no BotKeep calls, no fabricated articles. Integration contract for AI will be server-to-server, with provider credentials absent from public clients.

Future: editorial CRUD, revisions/audit triggers, private staging media and safe publishing, scheduler, curated analytics, moderation and role management.

## Provenance

Fonts are supplied by Fontsource packages carrying their upstream font licenses (OFL). Lucide icons use the package license; the book favicon is a simple repository-authored SVG. No downloaded editorial imagery or third-party article text is seeded. npm dependency license metadata and lockfile record package origins.
