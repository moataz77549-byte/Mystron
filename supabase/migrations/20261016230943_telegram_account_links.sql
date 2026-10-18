create or replace function public.telegram_create_link(p_hash text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.actor_active(auth.uid()) or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'FORBIDDEN' using errcode='42501';end if;
 delete from private.telegram_link_tokens where user_id=auth.uid();
 insert into private.telegram_link_tokens(token_hash,user_id,session_id,issued_at,expires_at) values(p_hash,auth.uid(),(auth.jwt()->>'session_id')::uuid,(auth.jwt()->>'iat')::bigint,now()+interval '5 minutes');
 insert into public.audit_logs(actor_id,action,entity_type) values(auth.uid(),'TELEGRAM_LINK_REQUESTED','telegram');
end $$;
revoke all on function public.telegram_create_link(text) from public,anon;grant execute on function public.telegram_create_link(text) to authenticated;
create or replace function public.telegram_unlink() returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.actor_active(auth.uid()) then raise exception 'FORBIDDEN';end if;
 delete from public.telegram_links where user_id=auth.uid();delete from private.telegram_link_tokens where user_id=auth.uid();delete from private.telegram_states where user_id=auth.uid();
 update public.telegram_deliveries set status='dead',body='{}',last_error='UNLINKED' where user_id=auth.uid() and status<>'sent';
 insert into public.audit_logs(actor_id,action,entity_type) values(auth.uid(),'TELEGRAM_UNLINKED','telegram');
end $$;
revoke all on function public.telegram_unlink() from public,anon;grant execute on function public.telegram_unlink() to authenticated;
create or replace function private.telegram_actor(p_telegram_id bigint) returns public.telegram_links language plpgsql security definer set search_path='' as $$
declare link public.telegram_links;
begin
 select * into link from public.telegram_links where telegram_id=p_telegram_id and enabled;
 if not found then raise exception 'TELEGRAM_NOT_LINKED' using errcode='42501';end if;
 perform set_config('request.jwt.claim.sub',link.user_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',link.user_id,'session_id',link.session_id,'iat',link.issued_at,'aal','aal1','role','authenticated')::text,true);
 -- No sensitive proof is ever delegated to Telegram.
 perform set_config('request.headers','{}',true);
 if not private.actor_active(link.user_id) then raise exception 'TELEGRAM_SESSION_EXPIRED' using errcode='42501';end if;
 return link;
end $$;
revoke all on function private.telegram_actor(bigint) from public,anon,authenticated;
create or replace function public.telegram_consume_link(p_hash text,p_telegram_id bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare token private.telegram_link_tokens;link public.telegram_links;
begin
 if p_telegram_id<=0 then raise exception 'INVALID_LINK';end if;
 select * into token from private.telegram_link_tokens where token_hash=p_hash for update;
 if not found or token.expires_at<=now() or token.consumed_at is not null then raise exception 'INVALID_LINK';end if;
 perform set_config('request.jwt.claim.sub',token.user_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',token.user_id,'session_id',token.session_id,'iat',token.issued_at,'role','authenticated')::text,true);
 if not private.actor_active(token.user_id) then raise exception 'INVALID_LINK';end if;
 if exists(select 1 from public.telegram_links where telegram_id=p_telegram_id and user_id<>token.user_id) then raise exception 'TELEGRAM_ALREADY_LINKED';end if;
 insert into public.telegram_links(user_id,telegram_id,session_id,issued_at) values(token.user_id,p_telegram_id,token.session_id,token.issued_at)
 on conflict(user_id) do update set telegram_id=excluded.telegram_id,session_id=excluded.session_id,issued_at=excluded.issued_at,linked_at=now(),enabled=true;
 update private.telegram_link_tokens set consumed_at=now() where token_hash=p_hash;
 insert into public.audit_logs(actor_id,action,entity_type) values(token.user_id,'TELEGRAM_LINKED','telegram');return token.user_id;
end $$;
revoke all on function public.telegram_consume_link(text,bigint) from public,anon,authenticated;grant execute on function public.telegram_consume_link(text,bigint) to service_role;
