create or replace function public.telegram_ingest(p_update_id bigint,p_telegram_id bigint,p_payload jsonb) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_update_id<0 or p_telegram_id<=0 or octet_length(p_payload::text)>100000 then raise exception 'INVALID_UPDATE';end if;
 insert into public.telegram_updates(update_id,telegram_id,payload) values(p_update_id,p_telegram_id,p_payload) on conflict do nothing;
 if not found then return false;end if;
 insert into public.automation_jobs(kind,dedupe_key,payload) values('telegram','tg:'||p_update_id,jsonb_build_object('update_id',p_update_id,'telegram_id',p_telegram_id)) on conflict do nothing;return true;
end $$;
revoke all on function public.telegram_ingest(bigint,bigint,jsonb) from public,anon,authenticated;grant execute on function public.telegram_ingest(bigint,bigint,jsonb) to service_role;
