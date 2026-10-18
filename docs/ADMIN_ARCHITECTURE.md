# Stage 3 control center

The existing App Router application and CMS are extended in place. `/admin/dashboard` uses scoped SQL aggregates, not a client scan of all posts. `/admin` redirects to it. Every protected layout verifies Supabase Auth with getUser and calls admin_identity; the identity RPC checks current database grants, confirmed email, active administrative membership, the JWT session_id against auth.sessions, session age and explicit administrative revocation. Neither user_metadata nor cached role claims grant access.

`src/lib/control/service.ts` is the server-only control API boundary. Input schemas are strict, DTOs omit invitation hashes, API responses are private/no-store, writes check Origin and shared database rate limits, and SQL commands independently authorize the current actor. `SiteSettingsService` validates/version-checks writes, records audit metadata and revalidates public layouts. Database functions own transactional role changes/invitation acceptance/content transitions; the React UI contains no privileged key.

The existing CMS functions were replaced with permission checks, rather than creating a second publishing system. The editor remains in administrative bundles. Public readers receive allowlisted publication fields, safe rendered editor JSON and public settings. Public navigation, identity assets, home sections and advertisement placements read database configuration. Maintenance preserves Auth, administration, invitation acceptance, health and Cron recovery routes.

Lists are bounded: users/control resources 25 per page, CMS post lists 100, security sessions latest 50, roles at most 8×25 grants. Analytics accepts at most 366 inclusive UTC days and paginates post performance. Category/author rankings return top 25; no traffic-source/device data is invented. CSV exports one authorized page at a time and neutralizes spreadsheet formulas.

Local integration testing uses real PGlite migrations/RLS/RPC with simulated Auth/Storage protocols. It is not a substitute for verifying real SMTP, MFA, owner bootstrap, Storage and deployment credentials. The fixture has no application production switch and is not deployed.

On phones, administrative records use labeled definition-list cards rather than compressed desktop columns. Desktop keeps semantic tables; CSS chooses the visible representation without client JavaScript. Browser checks verify the correct representation at both widths.
