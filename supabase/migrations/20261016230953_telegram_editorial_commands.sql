create or replace function public.telegram_execute(p_telegram_id bigint,p_update_id bigint,p_command text,p_args jsonb,p_state jsonb default null,p_state_version bigint default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare link public.telegram_links;result jsonb;current_state private.telegram_states;
begin
 link=private.telegram_actor(p_telegram_id);
 if not exists(select 1 from public.telegram_updates where update_id=p_update_id and telegram_id=p_telegram_id) then raise exception 'INVALID_UPDATE';end if;
 perform pg_advisory_xact_lock(hashtextextended('telegram:'||link.user_id,0));
 select r.result into result from private.telegram_receipts r where update_id=p_update_id and command_key=p_command;
 if found then
 if p_command in ('save','transition') and not exists(select 1 from public.posts p where p.id=(result->>'id')::uuid and private.can_post(p,'posts.read')) then raise exception 'FORBIDDEN';end if;
 return result;end if;
 select * into current_state from private.telegram_states where user_id=link.user_id for update;
 if p_state_version is not null and coalesce(current_state.version,0)<>p_state_version then raise exception 'STATE_CONFLICT';end if;
 if p_command='save' then result=to_jsonb(public.cms_save_post(nullif(p_args->>'id','')::uuid,p_args->'patch',nullif(p_args->>'version','')::bigint));
 elsif p_command='transition' then result=to_jsonb(public.cms_transition_post((p_args->>'id')::uuid,p_args->>'action',(p_args->>'version')::bigint,nullif(p_args->>'scheduled_at','')::timestamptz));
 elsif p_command='comment' then perform public.cms_moderate_comment((p_args->>'id')::uuid,p_args->>'action');result='{"ok":true}';
 elsif p_command='media' then result=to_jsonb(public.cms_register_media(p_args));
 elsif p_command='preferences' then
 if not private.allowed_keys(p_args,array['enabled','kinds','priorities','quiet_start','quiet_end','daily_digest']) or jsonb_typeof(p_args->'enabled')<>'boolean' or jsonb_typeof(p_args->'kinds')<>'array' or jsonb_typeof(p_args->'priorities')<>'array' or jsonb_typeof(p_args->'daily_digest')<>'boolean' or coalesce((p_args->>'quiet_start')::int,0) not between 0 and 23 or coalesce((p_args->>'quiet_end')::int,0) not between 0 and 23 then raise exception 'INVALID_PREFERENCES';end if;
 update public.telegram_links set preferences=p_args where user_id=link.user_id;result='{"ok":true}';
 elsif p_command='state' then result='{"ok":true}';
 else raise exception 'INVALID_COMMAND';end if;
 if p_state is not null then
 if p_command='save' and p_state?'draft' then p_state=jsonb_set(jsonb_set(jsonb_set(p_state,'{draft,id}',result->'id'),'{draft,version}',result->'version'),'{draft,slug}',result->'slug');end if;
 if octet_length(p_state::text)>300000 then raise exception 'STATE_TOO_LARGE';end if;
 insert into private.telegram_states(user_id,state) values(link.user_id,p_state) on conflict(user_id) do update set state=excluded.state,version=private.telegram_states.version+1,updated_at=now(),expires_at=now()+interval '7 days';
 end if;
 insert into private.telegram_receipts values(p_update_id,p_command,link.user_id,result,now());
 insert into public.audit_logs(actor_id,action,entity_type,metadata) values(link.user_id,'TELEGRAM_COMMAND','telegram',jsonb_build_object('command',p_command,'update_id',p_update_id));
 return result;
end $$;
revoke all on function public.telegram_execute(bigint,bigint,text,jsonb,jsonb,bigint) from public,anon,authenticated;grant execute on function public.telegram_execute(bigint,bigint,text,jsonb,jsonb,bigint) to service_role;
