create or replace function public.ai_admin_settings(p_value jsonb,p_version bigint) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_permission('integrations.manage');
 if not private.allowed_keys(p_value,array['enabled','provider','model','embedding_model','streaming','max_output_tokens','daily_requests','monthly_requests','daily_tokens','session_requests','visitor_requests','admin_requests','allow_private_editorial','language']) then raise exception 'INVALID_SETTINGS';end if;
 update public.ai_configuration set enabled=(p_value->>'enabled')::boolean,provider=p_value->>'provider',model=left(p_value->>'model',200),embedding_model=left(p_value->>'embedding_model',200),streaming=(p_value->>'streaming')::boolean,max_output_tokens=(p_value->>'max_output_tokens')::int,daily_requests=(p_value->>'daily_requests')::int,monthly_requests=(p_value->>'monthly_requests')::int,daily_tokens=(p_value->>'daily_tokens')::bigint,session_requests=(p_value->>'session_requests')::int,visitor_requests=(p_value->>'visitor_requests')::int,admin_requests=(p_value->>'admin_requests')::int,allow_private_editorial=(p_value->>'allow_private_editorial')::boolean,language=p_value->>'language',version=version+1,updated_at=now() where singleton and version=p_version;
 if not found then raise exception 'VERSION_CONFLICT';end if;
 insert into public.audit_logs(actor_id,action,entity_type,metadata) values(auth.uid(),'INTEGRATION_CHANGED','ai',jsonb_build_object('version',p_version+1));
end $$;
revoke all on function public.ai_admin_settings(jsonb,bigint) from public,anon;grant execute on function public.ai_admin_settings(jsonb,bigint) to authenticated;
create or replace function public.ai_admin_overview(p_action text,p_page int default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_permission(case when p_action='usage' then 'analytics.read' else 'integrations.manage' end) then raise exception 'FORBIDDEN';end if;
 if p_page not between 1 and 10000 then raise exception 'INVALID_PAGE';end if;
 if p_action='settings' then return(select to_jsonb(c) from public.ai_configuration c where singleton);
 elsif p_action='usage' then return jsonb_build_object('rows',(select coalesce(jsonb_agg(x),'[]') from(select request_id,provider_id,model_id,request_type,input_tokens,output_tokens,token_accuracy,latency_ms,status,estimated_cost,created_at from public.ai_usage order by created_at desc limit 25 offset (p_page-1)*25)x),'total',(select count(*) from public.ai_usage));
 elsif p_action='knowledge' then return jsonb_build_object('profiles',(select coalesce(jsonb_agg(p),'[]') from public.ai_embedding_profiles p),'chunks',(select count(*) from public.ai_chunks),'jobs',(select coalesce(jsonb_agg(x),'[]') from(select id,kind,status,attempts,last_error,created_at from public.automation_jobs order by created_at desc limit 25 offset (p_page-1)*25)x));
 else raise exception 'INVALID_ACTION';end if;
end $$;
revoke all on function public.ai_admin_overview(text,int) from public,anon;grant execute on function public.ai_admin_overview(text,int) to authenticated;
create or replace function public.ai_reindex() returns int language plpgsql security definer set search_path='' as $$
declare n int;
begin
 perform private.require_permission('integrations.manage');
 insert into public.automation_jobs(kind,dedupe_key,payload) select 'index','index:'||id||':'||version,jsonb_build_object('post_id',id,'version',version) from public.posts where status='published' and visibility='public' and deleted_at is null and published_at<=now() on conflict(dedupe_key) do update set status='pending',attempts=0,available_at=now(),lease_token=null,lease_until=null where public.automation_jobs.status in ('done','dead');
 get diagnostics n=row_count;insert into public.audit_logs(actor_id,action,entity_type) values(auth.uid(),'AI_REINDEX_REQUESTED','ai');return n;
end $$;
revoke all on function public.ai_reindex() from public,anon;grant execute on function public.ai_reindex() to authenticated;
