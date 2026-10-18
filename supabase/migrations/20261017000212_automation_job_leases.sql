create table if not exists private.gateway_nonces(nonce_hash text primary key,created_at timestamptz not null default now());
alter table private.gateway_nonces enable row level security;revoke all on private.gateway_nonces from public,anon,authenticated;
create or replace function public.automation_nonce(p_hash text) returns boolean language plpgsql security definer set search_path='' as $$
begin if p_hash !~ '^[a-f0-9]{64}$' then return false;end if;delete from private.gateway_nonces where created_at<now()-interval '10 minutes';insert into private.gateway_nonces values(p_hash,now()) on conflict do nothing;return found;end $$;
revoke all on function public.automation_nonce(text) from public,anon,authenticated;grant execute on function public.automation_nonce(text) to service_role;
create or replace function public.automation_claim(p_limit int default 2) returns setof public.automation_jobs language plpgsql security definer set search_path='' as $$
begin
 update public.automation_jobs set status='dead',last_error='LEASE_EXHAUSTED',finished_at=now() where attempts>=5 and status='running' and lease_until<now();
 return query update public.automation_jobs j set status='running',attempts=j.attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds' where j.id in(select id from public.automation_jobs where attempts<5 and available_at<=now() and(status='pending' or(status='running' and lease_until<now())) order by created_at,id for update skip locked limit least(greatest(p_limit,1),5)) returning j.*;
end $$;
revoke all on function public.automation_claim(int) from public,anon,authenticated;grant execute on function public.automation_claim(int) to service_role;
create or replace function public.automation_finish(p_id uuid,p_lease uuid,p_success boolean,p_error text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.automation_jobs set status=case when p_success then 'done' when attempts>=5 then 'dead' else 'pending' end,finished_at=case when p_success or attempts>=5 then now() end,last_error=case when p_success then null else left(regexp_replace(coalesce(p_error,'FAILED'),'[^A-Z0-9_]','','g'),80) end,available_at=now()+make_interval(secs=>least(900,15*power(2,attempts)::int)),lease_until=null where id=p_id and lease_token=p_lease and status='running' and lease_until>now();
 if not found then raise exception 'STALE_LEASE';end if;
end $$;
revoke all on function public.automation_finish(uuid,uuid,boolean,text) from public,anon,authenticated;grant execute on function public.automation_finish(uuid,uuid,boolean,text) to service_role;
