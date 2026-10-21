-- TEST ONLY. Minimal Supabase SQL interfaces, not actual Auth or Storage services.
-- Target: dawn-cherry-68687091 / br-autumn-hat-am7i09m0 / maystroon_test.
create role anon nologin;
create role authenticated nologin;
create role authenticator nologin;
create role service_role nologin;
grant anon,authenticated,authenticator,service_role to neondb_owner;
create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz,updated_at timestamptz,aal text default 'aal1',not_after timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid(),auth.jwt() to anon,authenticated;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create schema maystroon_test_harness;
create table maystroon_test_harness.migration_runs(version text primary key,filename text not null,sha256 text not null,phase text not null check(phase in ('baseline','pending')),provider_omissions text[] not null default '{}',applied_at timestamptz not null default now());
revoke all on schema maystroon_test_harness from public;
