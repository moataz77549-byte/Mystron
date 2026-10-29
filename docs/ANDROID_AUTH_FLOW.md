# Native authentication boundary — not implemented yet

Guest reading is implemented and never requires login. Optional native login is
not yet available. No authentication placeholder grants an administrative role.

The website currently resolves Supabase SSR cookies with `auth.getUser()`, then
calls `admin_identity()` using the user's database client. Privileged mutations
also verify browser origin and database-enforced PIN proof. The Android reader
does not bypass these protections or carry a service-role credential.

Before native administration can ship, implement a verified bearer transport
sharing `admin_identity`, scoped RLS and the existing CMS services; bind PIN proof
to the authenticated session; test expiration, logout, disabled accounts, category
scope, ownership and self-promotion denial. Preserve cookie CSRF checks unchanged.
Refresh/access tokens must be encrypted with Android Keystore-backed storage;
passwords must not be persisted. Verified App Links require the final signing
certificate fingerprint and matching domain association before use.
