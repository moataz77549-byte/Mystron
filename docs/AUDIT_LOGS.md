# Administrative audit logs

Reuse audit_logs: id is event ID, actor_id, action, entity_type/resource type, entity_id/resource ID, created_at, metadata, request_id and result. Authenticated roles have SELECT only through audit.read and scoped RLS; ordinary INSERT/UPDATE/DELETE grants are absent. Authorized database commands append logs inside their transaction. A privileged database operator can still alter a database; these logs are not advertised as tamper-proof evidence.

`/admin/audit-logs` supports action/date filters, newest-first pages of 25, event metadata details and one-page CSV export. Scope-restricted readers see their own actions or accessible post events. Export escapes quotes/newlines and formula prefixes.

Metadata for settings/role operations contains allowlisted IDs, flags and changed-key names, never password/PIN/hash/nonce/Auth access or refresh tokens. Failed transactions roll back their audit rows; separate security events capture login/PIN failures with fixed event names and request IDs. Do not interpret an absent audit event as proof an attempted request never happened.

private.control_retention runs daily through Supabase Cron when available; default retention is 90 days for security events, 365 days audit, 90 days notifications, 30 days after invitation expiry, and immediate cleanup of expired proofs on the next job. Revoked Auth session IDs persist while those Auth sessions may still be usable, including refresh, to prevent token-refresh bypass.
