# MAYSTROON — GitHub administrator OAuth

This change adds an **opt-in GitHub sign-in** button to the existing
`/admin/login`. It does **not** replace email/password, alter Supabase project
identity, automatically create admin roles, or grant access based on GitHub
user metadata, email, repository access, or profile name.

## Provider configuration (external, never committed)

1. Create an OAuth App in https://github.com/settings/applications/new.
2. Homepage URL: `https://mystron-henna.vercel.app`.
3. GitHub OAuth application callback:
   `https://ttvasynaxkkcwrmvlorg.supabase.co/auth/v1/callback`.
4. In https://supabase.com/dashboard/project/ttvasynaxkkcwrmvlorg/auth/providers
   enable GitHub and configure **Client ID** and **Client Secret** directly.
   Do not place the secret in the repository, client-side environment variables,
   issue comments, application output, or logs.
5. In Supabase Auth URL Configuration allow the app callback:
   `https://mystron-henna.vercel.app/auth/callback`.
   Set Site URL to `https://mystron-henna.vercel.app`.
6. Ensure Vercel `NEXT_PUBLIC_SITE_URL` matches the deployed HTTPS origin,
   and the existing Supabase public key and server-only key are valid.

## Authentication and authorization

- `GET /auth/github` starts the OAuth authorization flow with the existing
  cookie-based SSR client and PKCE, targeting the app callback.
- `GET /auth/callback` exchanges the code, validates verified email, then
  calls `admin_identity` to check enabled membership and effective permissions.
- A GitHub account **without a preexisting authorized role** is rejected from
  administration. Administrator invitations or a trusted owner-reviewed grant
  must bind the resulting `auth.users.id` to `public.user_roles` and
  `public.admin_memberships` using existing RLS/RPC rules.
- Never use `user_metadata`, unverified GitHub emails, or a frontend check to
  assign privileges. The existing OWNER role must remain unchanged.

A read-only query for identifying GitHub-linked accounts:

```sql
select u.id, u.email, i.provider
from auth.users u
join auth.identities i on i.user_id = u.id
where i.provider = 'github';
```

## Verification and limitations

Run `npm run test`, `npm run typecheck`, `npm run build` and CI.
Complete the GitHub consent with a test account; an unauthorized account must
land on `/admin/login?reason=access`, while a preapproved admin is allowed
through. If the provider has not yet been enabled, GitHub OAuth cannot be
end-to-end tested solely through code changes.

Android v1.0.0-rc.3 still provides the guest-first reader; native administration,
submissions and release signing remain separate, incomplete work.
