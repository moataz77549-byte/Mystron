# Universal API implementation status

© معتز العلقمي — اليمن، تعز — 2026م

The existing Next.js `/api/v1` implementation remains the single API. New reader
routes call the existing content and navigation services. No database/project or
publishing engine is duplicated. `openapi/maystroon-v1.yaml` currently describes
the contracted public-reader slice, not all target APIs. The inventory records
the remaining website APIs and native gaps; full OpenAPI coverage is unfinished.

Public success envelopes retain their current shapes. `/posts` and `/search`
return `{data,total,page,pageSize}`; most detail/catalog APIs return `{data}`.
Authors additionally return `page/pageSize` without a total. Unknown fields are
forward compatible. Native DTOs must not assume all APIs use a common paginator.

Existing `/posts` already supplies newest articles; no duplicate `/latest` engine
is needed. `/posts?author=slug` already filters authors; the added nested author
route is a thin adapter. Related articles reuse the same public post filter.
The new home route reuses `homeData`, `featuredPost` and `popularPosts`; home
service failure returns 503 rather than fabricated successful empty content.

Public reads use the public Supabase client and RLS plus explicit publication
filters. All public responses retain `Cache-Control: no-store`, so an article
withdrawal is visible on the next online read. The shared IP limiter now supplies
`Retry-After: 60` for a rejected request. Errors remain `{error:{code}}`.

Android does not spoof a browser Origin header. Existing browser mutation APIs
retain same-origin checks. Mobile public writes and administrative bearer/PIN
transport require separate abuse/security tests before adoption by native UI.

Shared fixture `packages/contracts/fixtures/public-reader-page.json` is test-only.
Zod checks its server-side DTO and Kotlin decodes the same file in unit tests.
No fixture is seeded into production or shown as live content in the application.
