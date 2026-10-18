-- Stage 4: durable transport/state and provider-neutral knowledge. No credentials are stored.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create table if not exists public.telegram_links(
 user_id uuid primary key references auth.users(id) on delete cascade,
 telegram_id bigint unique not null check(telegram_id>0), session_id uuid not null,
 issued_at bigint not null, linked_at timestamptz not null default now(),
 enabled boolean not null default true,
 preferences jsonb not null default '{"enabled":true,"kinds":[],"priorities":["normal","high"],"quiet_start":null,"quiet_end":null,"daily_digest":false}'::jsonb
);
alter table public.telegram_links enable row level security;
revoke all on public.telegram_links from public,anon,authenticated;
grant select on public.telegram_links to authenticated;
drop policy if exists telegram_link_self on public.telegram_links;
create policy telegram_link_self on public.telegram_links for select to authenticated using(user_id=(select auth.uid()) and (select private.actor_active(auth.uid())));
create table if not exists private.telegram_link_tokens(
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,issued_at bigint not null,expires_at timestamptz not null,consumed_at timestamptz
);
alter table private.telegram_link_tokens enable row level security;
revoke all on private.telegram_link_tokens from public,anon,authenticated;
create index if not exists telegram_link_tokens_user_idx on private.telegram_link_tokens(user_id);
create table if not exists private.telegram_states(
 user_id uuid primary key references auth.users(id) on delete cascade, version bigint not null default 1,
 state jsonb not null default '{}',updated_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '7 days'
);
alter table private.telegram_states enable row level security;
revoke all on private.telegram_states from public,anon,authenticated;
create table if not exists public.telegram_updates(
 update_id bigint primary key,telegram_id bigint not null,payload jsonb not null,
 received_at timestamptz not null default now(),processed_at timestamptz
);
alter table public.telegram_updates enable row level security;
revoke all on public.telegram_updates from public,anon,authenticated;
create table if not exists private.telegram_receipts(
 update_id bigint not null references public.telegram_updates(update_id) on delete cascade,command_key text not null,
 user_id uuid not null references auth.users(id) on delete cascade,result jsonb not null,created_at timestamptz not null default now(),
 primary key(update_id,command_key)
);
alter table private.telegram_receipts enable row level security;
revoke all on private.telegram_receipts from public,anon,authenticated;
create table if not exists public.automation_jobs(
 id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('telegram','index','notification','digest')),
 dedupe_key text not null unique,payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','running','done','dead')),
 attempts int not null default 0 check(attempts between 0 and 5),available_at timestamptz not null default now(),
 lease_token uuid,lease_until timestamptz,last_error text,created_at timestamptz not null default now(),finished_at timestamptz
);
alter table public.automation_jobs enable row level security;
revoke all on public.automation_jobs from public,anon,authenticated;
create index if not exists automation_pending_idx on public.automation_jobs(available_at,created_at) where status in ('pending','running');
create table if not exists public.telegram_deliveries(
 id uuid primary key default gen_random_uuid(),dedupe_key text not null unique,user_id uuid references auth.users(id) on delete cascade,
 telegram_id bigint not null,body jsonb not null,source_notification_id uuid references public.admin_notifications(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','sending','sent','dead')),
 attempts int not null default 0,lease_token uuid,lease_until timestamptz,available_at timestamptz not null default now(),
 message_id bigint,last_error text,created_at timestamptz not null default now(),sent_at timestamptz
);
alter table public.telegram_deliveries enable row level security;
revoke all on public.telegram_deliveries from public,anon,authenticated;
create index if not exists telegram_delivery_queue_idx on public.telegram_deliveries(available_at,created_at) where status in ('pending','sending');
create table if not exists public.ai_configuration(
 singleton boolean primary key default true check(singleton),enabled boolean not null default false,
 provider text not null default 'compatible' check(provider in ('compatible','botkeep')),
 model text not null default '',embedding_model text not null default '',streaming boolean not null default false,
 max_output_tokens int not null default 800 check(max_output_tokens between 64 and 4096),
 daily_requests int not null default 500 check(daily_requests between 1 and 100000),
 monthly_requests int not null default 5000 check(monthly_requests between 1 and 1000000),
 daily_tokens bigint not null default 500000 check(daily_tokens between 1000 and 100000000),
 session_requests int not null default 20 check(session_requests between 1 and 1000),
 visitor_requests int not null default 30 check(visitor_requests between 1 and 1000),
 admin_requests int not null default 100 check(admin_requests between 1 and 10000),
 allow_private_editorial boolean not null default false,language text not null default 'ar' check(language in ('ar','en')),
 version bigint not null default 1,updated_at timestamptz not null default now()
);
alter table public.ai_configuration enable row level security;
revoke all on public.ai_configuration from public,anon,authenticated;
insert into public.ai_configuration(singleton) values(true) on conflict do nothing;
create table if not exists public.ai_usage(
 request_id uuid primary key,provider_id text not null,model_id text not null,request_type text not null,
 user_id uuid references auth.users(id) on delete set null,session_hash text not null,visitor_hash text not null,
 reserved_tokens int not null check(reserved_tokens>0),input_tokens int,output_tokens int,
 token_accuracy text not null default 'estimated' check(token_accuracy in ('reported','estimated')),
 latency_ms int,status text not null default 'reserved' check(status in ('reserved','success','failed','cancelled')),
 estimated_cost numeric(14,8),error_code text,created_at timestamptz not null default now(),finished_at timestamptz
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from public,anon,authenticated;
create index if not exists ai_usage_time_idx on public.ai_usage(created_at);
create index if not exists ai_usage_subject_idx on public.ai_usage(visitor_hash,created_at);
create index if not exists ai_usage_session_idx on public.ai_usage(session_hash,created_at);
create index if not exists ai_usage_admin_idx on public.ai_usage(user_id,created_at);
create table if not exists public.ai_embedding_profiles(
 model_id text primary key,dimensions int not null check(dimensions between 1 and 4096),created_at timestamptz not null default now()
);
alter table public.ai_embedding_profiles enable row level security;
revoke all on public.ai_embedding_profiles from public,anon,authenticated;
create table if not exists public.ai_chunks(
 document_id uuid not null,post_id uuid not null references public.posts(id) on delete cascade,chunk_index int not null check(chunk_index>=0),
 chunk_text text not null check(length(chunk_text) between 1 and 4000),embedding extensions.vector not null,
 dimensions int not null check(dimensions between 1 and 4096),embedding_model text not null references public.ai_embedding_profiles(model_id),
 content_hash text not null,source_version bigint not null,source_url text not null,published_at timestamptz not null,indexed_at timestamptz not null default now(),
 search_vector tsvector generated always as(to_tsvector('simple',public.normalize_arabic(chunk_text))) stored,
 primary key(post_id,chunk_index),check(extensions.vector_dims(embedding)=dimensions)
);
alter table public.ai_chunks enable row level security;
revoke all on public.ai_chunks from public,anon,authenticated;
create index if not exists ai_chunks_search_idx on public.ai_chunks using gin(search_vector);
create index if not exists ai_chunks_model_idx on public.ai_chunks(embedding_model,dimensions);
create table if not exists private.ai_summary_cache(
 cache_key text primary key,post_id uuid not null references public.posts(id) on delete cascade,source_version bigint not null,
 model_id text not null,result jsonb not null,expires_at timestamptz not null default now()+interval '1 day'
);
alter table private.ai_summary_cache enable row level security;
revoke all on private.ai_summary_cache from public,anon,authenticated;
grant all on public.telegram_links,public.telegram_updates,public.automation_jobs,public.telegram_deliveries,public.ai_configuration,public.ai_usage,public.ai_embedding_profiles,public.ai_chunks to service_role;
-- All public functions below are deliberately service-only unless explicitly granted to authenticated.
