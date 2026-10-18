# CMS architecture

Stage 2 extends the Stage 1 branch without recreating Next.js or the repository. The main content tables remain posts, categories, authors, comments, revisions and media_assets. Additional tables hold media references, redirects, daily aggregate views, publishing runs and comment reports. Private comment contact details remain outside the exposed API schema.

`src/lib/cms.ts` validates an explicit command allowlist, verifies the Supabase user and database roles, derives text/HTML/media IDs from bounded editor JSON, invokes a transactional PostgreSQL RPC and invalidates the root layout. Route handlers enforce exact Origin for cookie-authenticated writes. RPCs independently verify confirmed auth.uid and roles; hiding UI buttons is not authorization.

OWNER/ADMIN/EDITOR can edit and publish. AUTHOR can create and edit their own draft/unpublished posts and submit them for review. Once submitted, only a publisher can return or edit them. Authors in the public directory are independent from login identities and confer no permissions. Account/role management remains a later phase.

Post writes require an optimistic version. Each successful mutation increments it and stores a revision before changes. Stale saves return VERSION_CONFLICT. Bulk transitions are atomic: one rejected item rolls back the entire batch. Revision restore changes content/associations, never ownership or publishing state. Deletion is soft; restore returns a draft.

Tiptap is imported only by the edit page. New-post/list pages use a small command client. Public reading uses Server Components and an allowlist renderer, not the editor bundle. Public repositories select publication fields explicitly. Raw revision documents and visitor hashes are not public.

Public pages and sitemap are dynamic. Manual mutations call revalidatePath; direct SQL scheduled publication is reflected on the next request. This favors correct visibility over caching draft-sensitive responses. Image proxies use no-store; originals remain in a private bucket.

Tests use PGlite PostgreSQL for actual migrations/RLS/RPC behavior. The browser suite uses an explicit local Supabase protocol fixture: Auth and Storage protocols are simulated, while content mutations execute those real SQL functions. It verifies application integration, not live Supabase Auth ownership or Vercel behavior. Fixture addresses, keys, users and text must never be deployed or migrated to production.
