
create or replace function public.record_security_event(p_actor uuid,p_event text,p_result text,p_request uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_event not in ('LOGIN_SUCCESS','LOGIN_FAILURE','PIN_FAILURE','PIN_CHANGED','USER_DISABLED','ROLE_CHANGED','SETTINGS_UPDATED','INTEGRATION_CHANGED','SESSION_REVOKED') or p_result not in ('success','failure') then raise exception 'INVALID_EVENT';end if;
 insert into public.security_events(actor_id,event_type,result,request_id) values(p_actor,p_event,p_result,p_request);
end $$;
revoke all on function public.security_pin_state(uuid),public.security_pin_attempt(uuid,boolean),public.security_save_pin(uuid,text,int,boolean),public.security_create_proof(uuid,uuid,text,boolean),public.record_security_event(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.security_pin_state(uuid),public.security_pin_attempt(uuid,boolean),public.security_save_pin(uuid,text,int,boolean),public.security_create_proof(uuid,uuid,text,boolean),public.record_security_event(uuid,text,text,uuid) to service_role;
create table if not exists private.revoked_admin_sessions(session_id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,revoked_at timestamptz not null default now());
alter table private.revoked_admin_sessions enable row level security;revoke all on private.revoked_admin_sessions from public,anon,authenticated;
alter table private.revoked_admin_sessions enable row level security;revoke all on private.revoked_admin_sessions from public,anon,authenticated;
create index if not exists revoked_admin_user_idx on private.revoked_admin_sessions(user_id);
create or replace function private.actor_active(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$ select coalesce(p_user=auth.uid() and exists(select 1 from auth.users u join public.admin_memberships a on a.user_id=u.id where u.id=p_user and u.email_confirmed_at is not null and a.enabled and to_timestamp(coalesce(nullif(auth.jwt()->>'iat',''),'0')::double precision)>=a.revoked_before and exists(select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=u.id and (s.not_after is null or s.not_after>now()) and not exists(select 1 from private.revoked_admin_sessions x where x.session_id=s.id))),false) $$;
create or replace function private.can_assign_role(p_actor uuid,p_role uuid) returns boolean language sql stable security definer set search_path='' as $$ select not exists(select 1 from public.roles where id=p_role and name='OWNER') and exists(select 1 from public.roles where id=p_role) and coalesce((select max(case r.name when 'OWNER' then 100 when 'SUPER_ADMIN' then 90 when 'ADMIN' then 80 when 'EDITOR_IN_CHIEF' then 70 when 'EDITOR' then 60 when 'AUTHOR' then 40 when 'MODERATOR' then 30 else 10 end) from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=p_actor and ur.is_active),0)>=(select case r.name when 'OWNER' then 100 when 'SUPER_ADMIN' then 90 when 'ADMIN' then 80 when 'EDITOR_IN_CHIEF' then 70 when 'EDITOR' then 60 when 'AUTHOR' then 40 when 'MODERATOR' then 30 else 10 end from public.roles r where r.id=p_role) and (private.permission_scope_for(p_actor,'users.invite') is not null or private.permission_scope_for(p_actor,'users.manage') is not null) and not exists(select 1 from public.role_permissions rp where rp.role_id=p_role and rp.enabled and (private.permission_scope_for(p_actor,rp.permission_key) is null or (rp.scope='all' and private.permission_scope_for(p_actor,rp.permission_key)='own'))) $$;
revoke all on function private.can_assign_role(uuid,uuid) from public,anon,authenticated;
create or replace function public.admin_update_user(p_user uuid,p_role uuid,p_enabled boolean,p_scope text,p_categories uuid[],p_revoke boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_permission('users.manage');
 perform private.check_delegated_scope(p_scope,p_categories,p_user);
 if p_user=auth.uid() or exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=p_user and ur.is_active and r.name='OWNER') then raise exception 'OWNER_OR_SELF_PROTECTED' using errcode='42501';end if;
 if not exists(select 1 from public.admin_memberships where user_id=p_user) or p_scope not in ('all','restricted') or cardinality(p_categories)>50 or exists(select 1 from unnest(p_categories) c where not exists(select 1 from public.categories where id=c and is_active and deleted_at is null)) then raise exception 'INVALID_ADMIN_CONFIGURATION';end if;
 if not private.has_role(array['OWNER']) and exists(select 1 from public.user_roles ur where ur.user_id=p_user and ur.is_active and not private.can_assign_role(auth.uid(),ur.role_id)) then raise exception 'TARGET_OUT_OF_AUTHORITY';end if;
 if p_role is not null then
 if not private.can_assign_role(auth.uid(),p_role) then raise exception 'ROLE_OUT_OF_AUTHORITY';end if;
 update public.user_roles set is_active=false where user_id=p_user;
 insert into public.user_roles(user_id,role_id,granted_by) values(p_user,p_role,auth.uid()) on conflict(user_id,role_id) do update set is_active=true,granted_by=auth.uid(),granted_at=now();end if;
 update public.admin_memberships set enabled=p_enabled,scope_mode=p_scope,category_ids=p_categories where user_id=p_user;
 if p_revoke or not p_enabled then
 insert into private.revoked_admin_sessions(session_id,user_id) select id,user_id from auth.sessions where user_id=p_user on conflict do nothing;
 update public.admin_memberships set revoked_before=date_trunc('second',now()) where user_id=p_user;end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),case when not p_enabled then 'USER_DISABLED' when p_revoke then 'SESSION_REVOKED' else 'ROLE_CHANGED' end,'user',p_user::text,jsonb_build_object('role_id',p_role,'enabled',p_enabled,'scope_mode',p_scope));
 insert into public.security_events(actor_id,event_type,result) values(auth.uid(),case when not p_enabled then 'USER_DISABLED' when p_revoke then 'SESSION_REVOKED' else 'ROLE_CHANGED' end,'success');
end $$;
create or replace function public.admin_set_role_permission(p_role uuid,p_permission text,p_scope text,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_permission('roles.manage');
 if not private.has_role(array['OWNER']) or not exists(select 1 from public.roles where id=p_role and name<>'OWNER') or not exists(select 1 from public.permissions where key=p_permission) or p_permission in ('roles.manage','security.manage','integrations.manage','maintenance.manage') or p_scope not in ('all','own') then raise exception 'RESERVED_PERMISSION';end if;
 insert into public.role_permissions(role_id,permission_key,scope,enabled) values(p_role,p_permission,p_scope,p_enabled) on conflict(role_id,permission_key) do update set scope=p_scope,enabled=p_enabled;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'ROLE_CHANGED','role',p_role::text,jsonb_build_object('permission',p_permission,'scope',p_scope,'enabled',p_enabled));
end $$;
create or replace function public.admin_set_user_permission(p_user uuid,p_permission text,p_effect text,p_scope text,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_permission('roles.manage');
 if p_user=auth.uid() or exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=p_user and ur.is_active and r.name='OWNER') or p_permission in ('roles.manage','security.manage','integrations.manage','maintenance.manage') or p_effect not in ('allow','deny') or p_scope not in ('own','all') then raise exception 'OWNER_OR_SELF_PROTECTED';end if;
 if not exists(select 1 from public.admin_memberships where user_id=p_user) then raise exception 'NOT_FOUND';end if;
 insert into public.user_permissions(user_id,permission_key,effect,scope,enabled,assigned_by) values(p_user,p_permission,p_effect,p_scope,p_enabled,auth.uid()) on conflict(user_id,permission_key) do update set effect=p_effect,scope=p_scope,enabled=p_enabled,assigned_by=auth.uid();
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'ROLE_CHANGED','user_permission',p_user::text,jsonb_build_object('permission',p_permission,'effect',p_effect,'scope',p_scope,'enabled',p_enabled));
end $$;
