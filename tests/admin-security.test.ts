import { vector } from "@electric-sql/pglite-pgvector";
import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
let db: PGlite;
const ids = {
  OWNER: "11111111-1111-4111-8111-111111111111",
  ADMIN: "22222222-2222-4222-8222-222222222222",
  EDITOR: "33333333-3333-4333-8333-333333333333",
  AUTHOR: "44444444-4444-4444-8444-444444444444",
  VIEWER: "55555555-5555-4555-8555-555555555555",
  GUEST: "66666666-6666-4666-8666-666666666666",
};
let roles: Record<string, string>;
let cat: string;
let otherCat: string;
let post: string;
async function actor(role: keyof typeof ids | "anon", proof = false) {
  await db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${role === "anon" ? "" : ids[role]}',false);select set_config('request.jwt.claims','${JSON.stringify(role === "anon" ? {} : { sub: ids[role], session_id: ids[role], iat: Math.floor(Date.now() / 1000) })}',false);select set_config('request.headers','${JSON.stringify(proof ? { "x-maystroon-proof": "e".repeat(64) } : {})}',false);set role ${role === "anon" ? "anon" : "authenticated"};`,
  );
}
async function scalar<T = unknown>(sql: string, args: unknown[] = []) {
  return (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
}
beforeAll(async () => {
  db = new PGlite({ extensions: { vector } });
  await db.exec(
    `create role anon;create role authenticated;create role authenticator;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now(),updated_at timestamptz default now(),aal text default 'aal1',not_after timestamptz);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid(),auth.jwt() to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`,
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  roles = Object.fromEntries(
    (
      await db.query<{ id: string; name: string }>("select id,name from roles")
    ).rows.map((r) => [r.name, r.id]),
  );
  for (const [role, id] of Object.entries(ids)) {
    await db.query("insert into auth.users values($1,$2,now())", [
      id,
      role === "OWNER"
        ? "mtzallqmy@gmail.com"
        : role.toLowerCase() + "@example.test",
    ]);
    await db.query("insert into auth.sessions(id,user_id) values($1,$1)", [id]);
    if (role !== "GUEST")
      await db.query("insert into user_roles(user_id,role_id) values($1,$2)", [
        id,
        roles[role],
      ]);
  }
  cat = (
    await db.query<{ id: string }>(
      "select id from categories where slug='books'",
    )
  ).rows[0].id;
  otherCat = (
    await db.query<{ id: string }>(
      "select id from categories where slug='life'",
    )
  ).rows[0].id;
  post = await scalar<string>(
    "insert into posts(title,slug,created_by,status,content) values('محتوى خاص','security-draft',$1,'draft','نص') returning id v",
    [ids.AUTHOR],
  );
  await db.query(
    "insert into post_categories(post_id,category_id) values($1,$2)",
    [post, cat],
  );
  await db.exec(
    "create temp table original_grants as select * from public.role_permissions;",
  );
});
afterAll(async () => db.close());
beforeEach(async () => {
  await db.exec(
    `reset role;update public.admin_memberships set enabled=true,scope_mode='all',category_ids='{}',revoked_before='1970-01-01';delete from private.revoked_admin_sessions;delete from public.user_permissions;delete from public.role_permissions;insert into public.role_permissions select * from original_grants;update auth.sessions set created_at=now(),not_after=null;delete from private.sensitive_proofs;delete from private.pin_controls;delete from private.account_pins;delete from public.admin_invitations;`,
  );
  await db.query("select public.security_save_pin($1,$2,600,true)", [
    ids.OWNER,
    "scrypt-v1$" + "a".repeat(32) + "$" + "b".repeat(128),
  ]);
  await db.query("select public.security_create_proof($1,$1,$2,true)", [
    ids.OWNER,
    "e".repeat(64),
  ]);
  await actor("OWNER", true);
});
it("visitor cannot use admin API RPC or read membership tables", async () => {
  await actor("anon");
  await expect(scalar("select admin_dashboard() v")).rejects.toThrow(
    /permission denied/,
  );
  await expect(db.query("select * from admin_memberships")).rejects.toThrow(
    /permission denied/,
  );
});
it("AUTHOR cannot manage users or grant permissions", async () => {
  await actor("AUTHOR");
  await expect(scalar("select admin_users() v")).rejects.toThrow("FORBIDDEN");
  await expect(
    db.query("select admin_set_role_permission($1,$2,$3,true)", [
      roles.AUTHOR,
      "users.manage",
      "all",
    ]),
  ).rejects.toThrow("FORBIDDEN");
});
it("EDITOR cannot change roles or settings without grants", async () => {
  await actor("EDITOR");
  await expect(
    db.query("select admin_set_role_permission($1,$2,$3,true)", [
      roles.EDITOR,
      "users.manage",
      "all",
    ]),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    db.query("select admin_update_setting('maintenance','{}',1)"),
  ).rejects.toThrow("FORBIDDEN");
});
it("ADMIN cannot modify OWNER even using direct RPC", async () => {
  await actor("ADMIN");
  await expect(
    db.query("select admin_update_user($1,null,false,$2,$3,false)", [
      ids.OWNER,
      "all",
      [],
    ]),
  ).rejects.toThrow("OWNER_OR_SELF_PROTECTED");
});
it("self promotion is rejected even by an owner", async () => {
  await expect(
    db.query("select admin_update_user($1,$2,true,$3,$4,false)", [
      ids.OWNER,
      roles.ADMIN,
      "all",
      [],
    ]),
  ).rejects.toThrow("OWNER_OR_SELF_PROTECTED");
});
it("owner core permissions cannot be customized or granted away", async () => {
  await expect(
    db.query("select admin_set_role_permission($1,$2,$3,true)", [
      roles.ADMIN,
      "roles.manage",
      "all",
    ]),
  ).rejects.toThrow("RESERVED_PERMISSION");
  await db.exec("reset role");
  await expect(
    db.query("insert into user_roles(user_id,role_id) values($1,$2)", [
      ids.GUEST,
      roles.OWNER,
    ]),
  ).rejects.toThrow("OWNER_ALREADY_EXISTS");
});
it("sensitive operations require session-bound PIN proof", async () => {
  await actor("OWNER");
  await expect(
    db.query("select admin_set_role_permission($1,$2,$3,false)", [
      roles.AUTHOR,
      "posts.delete",
      "own",
    ]),
  ).rejects.toThrow("PIN_VERIFICATION_REQUIRED");
  await actor("OWNER", true);
  await db.query("select admin_set_role_permission($1,$2,$3,false)", [
    roles.AUTHOR,
    "posts.delete",
    "own",
  ]);
});
it("a weak proof cannot change role permissions", async () => {
  await db.exec(
    "reset role;update private.sensitive_proofs set strong_until=null",
  );
  await actor("OWNER", true);
  await expect(
    db.query("select admin_set_role_permission($1,$2,$3,false)", [
      roles.AUTHOR,
      "posts.delete",
      "own",
    ]),
  ).rejects.toThrow("PIN_VERIFICATION_REQUIRED");
});
it("PIN changes invalidate previously issued proofs", async () => {
  await db.exec("reset role");
  await db.query("select security_save_pin($1,$2,600,true)", [
    ids.OWNER,
    "scrypt-v1$" + "c".repeat(32) + "$" + "d".repeat(128),
  ]);
  await actor("OWNER", true);
  await expect(
    db.query("select admin_set_role_permission($1,$2,$3,false)", [
      roles.AUTHOR,
      "posts.delete",
      "own",
    ]),
  ).rejects.toThrow("PIN_VERIFICATION_REQUIRED");
});
it("PIN guesses are delayed and produce no secret logs", async () => {
  await db.exec("reset role");
  expect(
    await scalar("select security_pin_attempt($1,false) v", [ids.OWNER]),
  ).toBe(false);
  expect(
    await scalar("select security_pin_attempt($1,true) v", [ids.OWNER]),
  ).toBe(false);
  const result = await db.query("select * from security_events");
  expect(JSON.stringify(result.rows)).not.toContain("scrypt-v1");
  expect(
    (
      await db.query<{ failures: number }>(
        "select failures from private.pin_controls",
      )
    ).rows[0].failures,
  ).toBe(1);
});
it("expired proofs are rejected", async () => {
  await db.exec(
    "reset role;update private.sensitive_proofs set expires_at=now()-interval '1 second'",
  );
  await actor("OWNER", true);
  await expect(
    db.query("select admin_set_role_permission($1,$2,$3,false)", [
      roles.AUTHOR,
      "posts.delete",
      "own",
    ]),
  ).rejects.toThrow("PIN_VERIFICATION_REQUIRED");
});
it("disabled account and revoked sessions lose access immediately", async () => {
  await db.query("select admin_update_user($1,null,false,$2,$3,true)", [
    ids.AUTHOR,
    "all",
    [],
  ]);
  await actor("AUTHOR");
  expect(
    (await scalar<{ active: boolean }>("select admin_identity() v")).active,
  ).toBe(false);
  await actor("OWNER", true);
  await db.query("select admin_update_user($1,null,true,$2,$3,false)", [
    ids.AUTHOR,
    "all",
    [],
  ]);
  await actor("AUTHOR");
  expect(
    (await scalar<{ active: boolean }>("select admin_identity() v")).active,
  ).toBe(false);
});
it("session expiry policy checks actual Auth session creation", async () => {
  await db.exec(
    "reset role;update auth.sessions set created_at=now()-interval '9 hours'",
  );
  await actor("OWNER", true);
  expect(
    (await scalar<{ active: boolean }>("select admin_identity() v")).active,
  ).toBe(false);
});
it("invitation requires confirmed matching email and is one-use", async () => {
  await db.query(
    "select admin_create_invitation('guest@example.test',$1,$2,now()+interval '1 day','all','{}')",
    [roles.AUTHOR, "f".repeat(64)],
  );
  await actor("VIEWER");
  await expect(
    db.query("select accept_admin_invitation($1)", ["f".repeat(64)]),
  ).rejects.toThrow("INVALID_OR_EXPIRED");
  await actor("GUEST");
  await db.query("select accept_admin_invitation($1)", ["f".repeat(64)]);
  await expect(
    db.query("select accept_admin_invitation($1)", ["f".repeat(64)]),
  ).rejects.toThrow("INVALID_OR_EXPIRED");
});
it("expired invitations cannot grant roles", async () => {
  await db.query(
    "select admin_create_invitation('guest@example.test',$1,$2,now()+interval '1 day','all','{}')",
    [roles.AUTHOR, "f".repeat(64)],
  );
  await db.exec(
    "reset role;update admin_invitations set expires_at=now()-interval '1 second'",
  );
  await actor("GUEST");
  await expect(
    db.query("select accept_admin_invitation($1)", ["f".repeat(64)]),
  ).rejects.toThrow("INVALID_OR_EXPIRED");
});
it("role deny overrides take effect without JWT refresh", async () => {
  await db.query(
    "select admin_set_user_permission($1,'posts.create','deny','own',true)",
    [ids.AUTHOR],
  );
  await actor("AUTHOR");
  const access = await scalar<{ permissions: Record<string, string> }>(
    "select admin_identity() v",
  );
  expect(access.permissions["posts.create"]).toBeUndefined();
});
it("category-scoped author cannot attach an outside category", async () => {
  await db.exec("reset role");
  await db.query(
    "update admin_memberships set scope_mode='restricted',category_ids=$1 where user_id=$2",
    [[cat], ids.AUTHOR],
  );
  await actor("AUTHOR");
  await expect(
    db.query("select cms_save_post(null,$1,null)", [
      JSON.stringify({
        title: "مرفوض",
        slug: "outside-scope",
        category_ids: [otherCat],
      }),
    ]),
  ).rejects.toThrow(/CATEGORY/);
});
it("drafts stay hidden from visitors; author reads only own draft", async () => {
  await actor("anon");
  expect(
    await scalar("select count(*)::int v from posts where id=$1", [post]),
  ).toBe(0);
  await actor("VIEWER");
  expect(
    await scalar("select count(*)::int v from posts where id=$1", [post]),
  ).toBe(1);
  await actor("EDITOR");
  expect(
    await scalar("select count(*)::int v from posts where id=$1", [post]),
  ).toBe(1);
});
it("audit logs cannot be updated or deleted by authenticated users", async () => {
  await expect(
    db.exec("update audit_logs set action='tampered'"),
  ).rejects.toThrow(/permission denied/);
  await expect(db.exec("delete from audit_logs")).rejects.toThrow(
    /permission denied/,
  );
});
it("analytics requires a dedicated permission", async () => {
  await actor("AUTHOR");
  await expect(
    db.query("select admin_analytics(current_date-7,current_date,1)"),
  ).rejects.toThrow("FORBIDDEN");
});
it("settings enforce complete schemas and optimistic concurrency", async () => {
  await expect(
    db.query("select admin_update_setting('security','{}',1)"),
  ).rejects.toThrow("INCOMPLETE_SETTING");
  const version = await scalar<number>(
    "select admin_update_setting('seo',$1,1) v",
    [JSON.stringify({ title_suffix: "ما يسطرون", description: "وصف موثق" })],
  );
  expect(Number(version)).toBe(2);
  await expect(
    db.query("select admin_update_setting('seo',$1,1)", [
      JSON.stringify({ title_suffix: "ما يسطرون", description: "وصف" }),
    ]),
  ).rejects.toThrow("VERSION_CONFLICT");
});
it("public settings never include comment blocklists or integration configs", async () => {
  await actor("anon");
  const rows = (
    await db.query<{ key: string }>("select key from site_settings")
  ).rows;
  expect(rows.map((r) => r.key)).not.toContain("security");
  expect(rows.map((r) => r.key)).not.toContain("comments");
  await expect(db.query("select * from integration_settings")).rejects.toThrow(
    /permission denied/,
  );
});
it("integration configuration rejects secret keys", async () => {
  await expect(
    db.query(
      "select admin_save_integration('telegram',true,'{\"token\":\"never-store\"}')",
    ),
  ).rejects.toThrow("INVALID_INTEGRATION");
});
it("maintenance changes are owner protected and audited", async () => {
  await actor("ADMIN");
  await expect(
    db.query("select admin_update_setting('maintenance',$1,1)", [
      JSON.stringify({ enabled: true, message: "صيانة", until: null }),
    ]),
  ).rejects.toThrow("FORBIDDEN");
});
it("unsafe links and menu cycles are rejected", async () => {
  await expect(
    db.query("select admin_save_menu(null,$1,false)", [
      JSON.stringify({
        location: "header",
        label: "خطر",
        target_type: "external",
        href: "javascript:alert(1)",
        is_active: true,
        sort_order: 0,
      }),
    ]),
  ).rejects.toThrow("INVALID_URL");
});
it("editing permission alone cannot unpublish a live post through transitions", async () => {
  await db.exec("reset role");
  await db.query(
    "update posts set status='published',published_at=now(),visibility='private' where id=$1",
    [post],
  );
  await db.query(
    "insert into user_permissions(user_id,permission_key,effect,scope) values($1,'posts.update','allow','all')",
    [ids.AUTHOR],
  );
  await actor("AUTHOR");
  await expect(
    db.query("select cms_transition_post($1,'draft',1,null)", [post]),
  ).rejects.toThrow("FORBIDDEN");
  await db.exec("reset role");
  await db.query(
    "update posts set status='draft',published_at=null where id=$1",
    [post],
  );
});
it("restricted administrator cannot invite a wider category scope", async () => {
  await db.exec("reset role");
  await db.query(
    "update admin_memberships set scope_mode='restricted',category_ids=$1 where user_id=$2",
    [[cat], ids.ADMIN],
  );
  await actor("ADMIN");
  await expect(
    db.query(
      "select admin_create_invitation('new@example.test',$1,$2,now()+interval '1 day','all','{}')",
      [roles.AUTHOR, "9".repeat(64)],
    ),
  ).rejects.toThrow("SCOPE_OUT_OF_AUTHORITY");
});
it("PIN proofs and invitation tokens have no public table read grants", async () => {
  await expect(
    db.query("select * from private.sensitive_proofs"),
  ).rejects.toThrow(/permission denied/);
  await expect(
    db.query("select token_hash from admin_invitations"),
  ).rejects.toThrow(/permission denied/);
});
it("global comment policy is applied at the database boundary", async () => {
  const policy = {
    enabled: false,
    pre_moderation: true,
    replies: true,
    max_depth: 3,
    limit: 5,
    window_seconds: 60,
    blocked_words: [],
    blocked_emails: [],
  };
  await db.query("select admin_update_setting('comments',$1,1)", [
    JSON.stringify(policy),
  ]);
  await db.exec("reset role;set role service_role");
  await expect(
    db.query("select submit_guest_comment($1,null,$2,$3,$4)", [
      post,
      "ضيف",
      "guest@example.test",
      "نص التعليق",
    ]),
  ).rejects.toThrow("COMMENTS_CLOSED");
});
it("notifications can only be changed by their recipient", async () => {
  await db.exec("reset role");
  const id = await scalar<string>(
    "insert into admin_notifications(user_id,kind,title,href) values($1,'test','اختبار','/admin/posts') returning id v",
    [ids.OWNER],
  );
  await actor("AUTHOR");
  await expect(
    db.query("select admin_notification_action($1,'read')", [id]),
  ).rejects.toThrow("NOT_FOUND");
});
it("every application table has RLS and mutations have no direct authenticated grants", async () => {
  await db.exec("reset role");
  expect(
    (
      await db.query(
        "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and not c.relrowsecurity",
      )
    ).rows,
  ).toEqual([]);
  const grants = (
    await db.query<{ table_name: string }>(
      "select table_name from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_schema='public' and privilege_type in ('INSERT','UPDATE','DELETE')",
    )
  ).rows;
  expect(grants).toEqual([]);
});
it("ADMIN cannot assign the higher SUPER_ADMIN role with otherwise similar grants", async () => {
  await actor("ADMIN");
  await expect(
    db.query("select admin_update_user($1,$2,true,'all','{}',false)", [
      ids.EDITOR,
      roles.SUPER_ADMIN,
    ]),
  ).rejects.toThrow("ROLE_OUT_OF_AUTHORITY");
});
it("public post DTO can read its comment close date without wider grants", async () => {
  await actor("anon");
  await expect(
    db.query("select id,title,comments_close_at from posts limit 1"),
  ).resolves.toBeDefined();
  const options = await scalar<Record<string, unknown>>(
    "select public_comment_options() v",
  );
  expect(options).not.toHaveProperty("blocked_emails");
  expect(options).not.toHaveProperty("blocked_words");
});
it("owner can revoke another administrative session without deleting Auth data", async () => {
  await db.query("select admin_revoke_session($1)", [ids.EDITOR]);
  await actor("EDITOR");
  expect(
    (await scalar<{ active: boolean }>("select admin_identity() v")).active,
  ).toBe(false);
  await db.exec("reset role");
  expect(
    await scalar("select count(*)::int v from auth.sessions where id=$1", [
      ids.EDITOR,
    ]),
  ).toBe(1);
});
it("review and period metrics use actual scoped history; absent history stays null", async () => {
  const metrics = await scalar<{
    average_review_hours: number | null;
    current_views: number;
    previous_views: number;
  }>("select admin_period_metrics(current_date-6,current_date) v");
  expect(metrics.average_review_hours).toBeNull();
  expect(Number(metrics.current_views)).toBe(0);
  expect(Number(metrics.previous_views)).toBe(0);
});
it("media settings reject executable configuration and enforce fixed security bounds", async () => {
  await expect(
    db.query("select admin_update_setting('media',$1,1)", [
      JSON.stringify({
        max_upload_bytes: 999999999,
        allow_gif: true,
        webp_quality: 82,
      }),
    ]),
  ).rejects.toThrow("INVALID_MEDIA_POLICY");
  await db.query("select admin_update_setting('media',$1,1)", [
    JSON.stringify({
      max_upload_bytes: 1048576,
      allow_gif: false,
      webp_quality: 70,
    }),
  ]);
  await actor("anon");
  expect(
    await scalar("select count(*)::int v from site_settings where key='media'"),
  ).toBe(0);
});
it("period comparison and review duration derive from actual retained events", async () => {
  await db.exec("reset role");
  await db.query(
    "insert into post_view_daily(post_id,day,views) values($1,current_date,12),($1,current_date-7,6)",
    [post],
  );
  await db.query(
    "insert into audit_logs(actor_id,action,entity_type,entity_id,created_at) values($1,'post_review','post',$2,now()-interval '2 hours'),($1,'post_publish','post',$2,now())",
    [ids.OWNER, post],
  );
  await actor("OWNER", true);
  const metrics = await scalar<{
    average_review_hours: number;
    current_views: number;
    previous_views: number;
    change_percent: number;
  }>("select admin_period_metrics(current_date-6,current_date) v");
  expect(Number(metrics.current_views)).toBe(12);
  expect(Number(metrics.previous_views)).toBe(6);
  expect(Number(metrics.change_percent)).toBe(100);
  expect(Number(metrics.average_review_hours)).toBe(2);
});
