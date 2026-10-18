# Owner activation — secure procedure

Owner email: `mtzallqmy@gmail.com`. **Email equality is not authentication and never assigns OWNER.**

1. Confirm the intended Supabase project ID is `ttvasynaxkkcwrmvlorg`; verify allowed redirect URLs, provider settings and SMTP/email delivery through the trusted Supabase dashboard. Do not use an unverified preview or localhost callback for production.
2. Through the official Supabase Auth invitation/sign-in flow, allow the owner to authenticate and complete **email verification personally**. Do not ask them to post password, OTP, magic URL or PIN to chat, GitHub or issue logs.
3. A trusted, authorized operator checks the confirmed `auth.users` record and verified user UUID separately. Confirm the user is the intended owner and that the email and confirmation state match. Do not substitute the email address as a UUID.
4. Only from a trusted privileged database session, after review of the existing SQL function and one-time lock state, run the existing restricted bootstrap against that **confirmed UUID**: `select private.bootstrap_owner('<VERIFIED_OWNER_UUID>'::uuid);`. Replace the placeholder privately, never in GitHub. Do not change function permissions to make it callable from the browser or authenticated REST.
5. Confirm exactly one OWNER is active, bootstrap is irreversibly closed and no unrelated account was elevated.
6. Sign in at the canonical production `/admin/login` using the legitimate Auth credentials. In `/admin/account`, set a fresh 6–12 digit PIN through the existing password-reauthenticated flow. Do not create a default PIN or store it in logs.
7. Verify admin role access, disabled-session handling, PIN proof expiry and failure lockout through a documented acceptance check. Keep test accounts out of production unless separately authorized and properly cleaned up.
8. If the previously shared service-role key is still in use, inventory consumers and perform a reviewed rotation using official Supabase procedures, updating host secret stores and redeploying dependent services. Never print or transmit the key in issue comments or chat.

Until these steps are complete, report `OWNER_PENDING_VERIFICATION`; do not claim successful administrative acceptance.
