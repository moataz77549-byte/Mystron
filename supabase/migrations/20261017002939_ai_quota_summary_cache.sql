create or replace function public.ai_reserve(p_id uuid,p_session text,p_visitor text,p_user uuid,p_provider text,p_model text,p_type text,p_tokens int) returns void language plpgsql security definer set search_path='' as $$
declare config public.ai_configuration;day_start timestamptz=date_trunc('day',now());
begin
 select * into config from public.ai_configuration where singleton for share;
 if not config.enabled then raise exception 'AI_DISABLED';end if;
 if p_session !~ '^[a-f0-9]{64}$' or p_visitor !~ '^[a-f0-9]{64}$' or p_tokens not between 1 and 100000 or length(p_model)>200 then raise exception 'INVALID_USAGE';end if;
 perform pg_advisory_xact_lock(hashtextextended('maystroon-ai-quota',0));
 if (select count(*) from public.ai_usage where created_at>=day_start)>=config.daily_requests or(select count(*) from public.ai_usage where created_at>=date_trunc('month',now()))>=config.monthly_requests or(select coalesce(sum(reserved_tokens),0) from public.ai_usage where created_at>=day_start)+p_tokens>config.daily_tokens or(select count(*) from public.ai_usage where session_hash=p_session and created_at>=day_start)>=config.session_requests or(p_user is null and(select count(*) from public.ai_usage where visitor_hash=p_visitor and created_at>=day_start)>=config.visitor_requests) or(p_user is not null and(select count(*) from public.ai_usage where user_id=p_user and created_at>=day_start)>=config.admin_requests) then raise exception 'AI_QUOTA_EXCEEDED';end if;
 insert into public.ai_usage(request_id,provider_id,model_id,request_type,user_id,session_hash,visitor_hash,reserved_tokens) values(p_id,p_provider,p_model,left(p_type,40),p_user,p_session,p_visitor,p_tokens);
end $$;
revoke all on function public.ai_reserve(uuid,text,text,uuid,text,text,text,int) from public,anon,authenticated;grant execute on function public.ai_reserve(uuid,text,text,uuid,text,text,text,int) to service_role;
create or replace function public.ai_cache_get(p_key text,p_post uuid,p_version bigint) returns jsonb language sql stable security definer set search_path='' as $$ select c.result from private.ai_summary_cache c join public.posts p on p.id=c.post_id where c.cache_key=p_key and p.id=p_post and p.version=p_version and p.version=c.source_version and c.expires_at>now() and p.status='published' and p.visibility='public' and p.deleted_at is null and p.published_at<=now() $$;
create or replace function public.ai_cache_put(p_key text,p_post uuid,p_version bigint,p_model text,p_result jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.posts where id=p_post and version=p_version and status='published' and visibility='public' and deleted_at is null and published_at<=now()) then
 insert into private.ai_summary_cache(cache_key,post_id,source_version,model_id,result) values(p_key,p_post,p_version,p_model,p_result) on conflict(cache_key) do update set result=excluded.result,expires_at=now()+interval '1 day';end if;
end $$;
revoke all on function public.ai_cache_get(text,uuid,bigint),public.ai_cache_put(text,uuid,bigint,text,jsonb) from public,anon,authenticated;grant execute on function public.ai_cache_get(text,uuid,bigint),public.ai_cache_put(text,uuid,bigint,text,jsonb) to service_role;
