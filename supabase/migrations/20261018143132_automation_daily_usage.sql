create or replace function public.automation_daily() returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.automation_retention();
 insert into public.automation_jobs(kind,dedupe_key,payload) select 'digest','digest:'||user_id||':'||(now() at time zone 'Asia/Aden')::date,jsonb_build_object('telegram_id',telegram_id) from public.telegram_links where enabled and(preferences->>'enabled')::boolean and(preferences->>'daily_digest')::boolean on conflict do nothing;
end $$;
revoke all on function public.automation_daily() from public,anon,authenticated;grant execute on function public.automation_daily() to service_role;
do $$begin if exists(select 1 from pg_namespace where nspname='cron') then perform cron.schedule('maystroon-automation-daily','0 17 * * *','select public.automation_daily();');end if;end $$;

create or replace function public.ai_index_prepare(p_id uuid,p_lease uuid,p_model text) returns int language plpgsql security definer set search_path='' as $$
declare job public.automation_jobs;
begin
 select * into job from public.automation_jobs where id=p_id and lease_token=p_lease and kind='index' and status='running' and lease_until>now() for update;if not found then raise exception 'STALE_LEASE';end if;
 if job.payload->>'model_key' is distinct from p_model then
 delete from public.ai_index_staging where job_id=p_id;
 update public.automation_jobs set payload=payload||jsonb_build_object('model_key',p_model,'cursor',0) where id=p_id;return 0;end if;
 return coalesce((job.payload->>'cursor')::int,0);
end $$;
revoke all on function public.ai_index_prepare(uuid,uuid,text) from public,anon,authenticated;grant execute on function public.ai_index_prepare(uuid,uuid,text) to service_role;

create or replace function private.automation_failed_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='dead' and old.status<>'dead' and new.kind in ('index','telegram') then
 insert into public.admin_notifications(user_id,kind,title,href,priority,context) select user_id,'automation','فشل مهمة تكامل بعد المحاولات المحدودة','/admin/ai/knowledge','high',jsonb_build_object('job_id',new.id) from public.admin_memberships where enabled and private.permission_scope_for(user_id,'integrations.manage') is not null;
 end if;return new;
end $$;
revoke all on function private.automation_failed_notification() from public,anon,authenticated;
drop trigger if exists automation_failed_notification on public.automation_jobs;
create trigger automation_failed_notification after update of status on public.automation_jobs for each row execute function private.automation_failed_notification();

create or replace function public.ai_usage_finish(p_id uuid,p_input int,p_output int,p_accuracy text,p_latency int,p_status text,p_error text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_status not in ('success','failed','cancelled') or p_accuracy not in ('reported','estimated') or p_input<0 or p_output<0 or p_latency<0 then raise exception 'INVALID_USAGE';end if;
 update public.ai_usage set input_tokens=p_input,output_tokens=p_output,token_accuracy=p_accuracy,latency_ms=p_latency,status=p_status,error_code=case when p_error is null then null else left(regexp_replace(p_error,'[^A-Z0-9_]','','g'),80) end,finished_at=now(),reserved_tokens=case when p_accuracy='reported' and p_input is not null and p_output is not null then greatest(1,p_input+p_output) else reserved_tokens end where request_id=p_id and status='reserved';
end $$;
revoke all on function public.ai_usage_finish(uuid,int,int,text,int,text,text) from public,anon,authenticated;grant execute on function public.ai_usage_finish(uuid,int,int,text,int,text,text) to service_role;
