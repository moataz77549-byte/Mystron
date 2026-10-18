create or replace function public.telegram_complete_update(p_id uuid,p_lease uuid,p_update bigint,p_body jsonb) returns void language plpgsql security definer set search_path='' as $$
declare item public.telegram_updates;link public.telegram_links;
begin
 if not exists(select 1 from public.automation_jobs where id=p_id and lease_token=p_lease and kind='telegram' and(payload->>'update_id')::bigint=p_update and status='running' and lease_until>now() for update) then raise exception 'STALE_LEASE';end if;
 select * into item from public.telegram_updates where update_id=p_update;
 select * into link from public.telegram_links where telegram_id=item.telegram_id;
 if octet_length(p_body::text)>60000 then raise exception 'REPLY_TOO_LARGE';end if;
 insert into public.telegram_deliveries(dedupe_key,user_id,telegram_id,body) values('reply:'||p_update,link.user_id,item.telegram_id,p_body) on conflict do nothing;
 update public.telegram_updates set processed_at=now(),payload='{}' where update_id=p_update;
 perform public.automation_finish(p_id,p_lease,true,null);
end $$;
revoke all on function public.telegram_complete_update(uuid,uuid,bigint,jsonb) from public,anon,authenticated;grant execute on function public.telegram_complete_update(uuid,uuid,bigint,jsonb) to service_role;
create or replace function public.telegram_claim_deliveries() returns setof public.telegram_deliveries language plpgsql security definer set search_path='' as $$
declare item public.telegram_deliveries;link public.telegram_links;allowed boolean;
begin
 for item in select * from public.telegram_deliveries where attempts<5 and available_at<=now() and(status='pending' or(status='sending' and lease_until<now())) order by created_at for update skip locked limit 5 loop
 allowed=true;
 if item.user_id is not null then
 begin
 link=private.telegram_actor(item.telegram_id);
 if link.user_id<>item.user_id then allowed=false;end if;
 if item.body?'auth_fingerprint' and item.body->>'auth_fingerprint'<>md5(public.admin_identity()::text) then allowed=false;end if;
 if coalesce(item.body->>'permission','')<>'' and not private.has_permission(item.body->>'permission') then allowed=false;end if;
 if exists(select 1 from jsonb_array_elements_text(coalesce(item.body->'post_ids','[]')) ids where not exists(select 1 from public.posts p where p.id=ids::uuid and private.can_post(p,coalesce(nullif(item.body->>'permission',''),'posts.read')))) then allowed=false;end if;
 exception when others then allowed=false;
 end;
 end if;
 if not allowed then update public.telegram_deliveries set status='dead',body='{}',last_error='ACCESS_REVOKED' where id=item.id;continue;end if;
 update public.telegram_deliveries set status='sending',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '60 seconds' where id=item.id returning * into item;return next item;
 end loop;
 update public.telegram_deliveries set status='dead',body='{}',last_error='DELIVERY_EXHAUSTED' where attempts>=5 and status='sending' and lease_until<now();
end $$;
revoke all on function public.telegram_claim_deliveries() from public,anon,authenticated;grant execute on function public.telegram_claim_deliveries() to service_role;
create or replace function public.telegram_ack_delivery(p_id uuid,p_lease uuid,p_message_id bigint,p_error text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.telegram_deliveries set status=case when p_error is null then 'sent' when attempts>=5 then 'dead' else 'pending' end,message_id=p_message_id,sent_at=case when p_error is null then now() end,body=case when p_error is null or attempts>=5 then '{}'::jsonb else body end,last_error=case when p_error is null then null else 'TELEGRAM_DELIVERY_FAILED' end,available_at=now()+make_interval(secs=>least(900,15*power(2,attempts)::int)),lease_until=null where id=p_id and lease_token=p_lease and status='sending';
 if not found then raise exception 'STALE_LEASE';end if;
end $$;
revoke all on function public.telegram_ack_delivery(uuid,uuid,bigint,text) from public,anon,authenticated;grant execute on function public.telegram_ack_delivery(uuid,uuid,bigint,text) to service_role;
