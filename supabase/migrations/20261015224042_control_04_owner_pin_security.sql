
revoke all on function public.admin_identity() from public,anon;
grant execute on function public.admin_identity() to authenticated;
create or replace function public.owner_setup_state() returns text language sql stable security definer set search_path='' as $$ select case when exists(select 1 from private.owner_bootstrap where completed_at is not null) and exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id join auth.users u on u.id=ur.user_id where r.name='OWNER' and ur.is_active and u.email_confirmed_at is not null) then 'configured' else 'pending_setup' end $$;
revoke all on function public.owner_setup_state() from public;
grant execute on function public.owner_setup_state() to anon,authenticated,service_role;
create or replace function private.guard_owner_role() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and exists(select 1 from public.roles where id=old.role_id and name='OWNER') and (new.user_id<>old.user_id or new.role_id<>old.role_id or not new.is_active) then raise exception 'OWNER_PROTECTED';end if;
 if tg_op='INSERT' and exists(select 1 from public.roles where id=new.role_id and name='OWNER') and exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where r.name='OWNER' and ur.is_active) then raise exception 'OWNER_ALREADY_EXISTS';end if;return new;
end $$;
revoke all on function private.guard_owner_role() from public,anon,authenticated;
drop trigger if exists guard_owner_role on public.user_roles;
create trigger guard_owner_role before insert or update on public.user_roles for each row execute function private.guard_owner_role();
alter table public.permissions enable row level security;revoke all on public.permissions from public,anon,authenticated;grant all on public.permissions to service_role;
alter table public.role_permissions enable row level security;revoke all on public.role_permissions from public,anon,authenticated;grant all on public.role_permissions to service_role;
alter table public.user_permissions enable row level security;revoke all on public.user_permissions from public,anon,authenticated;grant all on public.user_permissions to service_role;
alter table public.admin_memberships enable row level security;revoke all on public.admin_memberships from public,anon,authenticated;grant all on public.admin_memberships to service_role;
alter table public.admin_invitations enable row level security;revoke all on public.admin_invitations from public,anon,authenticated;grant all on public.admin_invitations to service_role;
alter table public.security_events enable row level security;revoke all on public.security_events from public,anon,authenticated;grant all on public.security_events to service_role;
alter table public.admin_notifications enable row level security;revoke all on public.admin_notifications from public,anon,authenticated;grant all on public.admin_notifications to service_role;
alter table public.menu_items enable row level security;revoke all on public.menu_items from public,anon,authenticated;grant all on public.menu_items to service_role;
alter table public.integration_settings enable row level security;revoke all on public.integration_settings from public,anon,authenticated;grant all on public.integration_settings to service_role;
alter table private.pin_controls enable row level security;revoke all on private.pin_controls from public,anon,authenticated;
alter table private.sensitive_proofs enable row level security;revoke all on private.sensitive_proofs from public,anon,authenticated;
grant select on public.permissions,public.role_permissions,public.user_permissions,public.admin_memberships,public.security_events,public.admin_notifications,public.menu_items,public.integration_settings to authenticated;
grant select(id,email,role_id,status,scope_mode,category_ids,created_by,accepted_by,created_at,expires_at,accepted_at,delivery_status) on public.admin_invitations to authenticated;
grant select on public.menu_items to anon;
revoke select on public.roles from anon;
drop policy if exists admin_read on public.permissions;create policy admin_read on public.permissions for select to authenticated using(private.has_permission('roles.manage'));
drop policy if exists admin_read on public.role_permissions;create policy admin_read on public.role_permissions for select to authenticated using(private.has_permission('roles.manage'));
drop policy if exists admin_read on public.user_permissions;create policy admin_read on public.user_permissions for select to authenticated using(user_id=(select auth.uid()) or private.has_permission('users.manage'));
drop policy if exists admin_read on public.admin_memberships;create policy admin_read on public.admin_memberships for select to authenticated using(user_id=(select auth.uid()) or private.has_permission('users.manage'));
drop policy if exists admin_read on public.admin_invitations;create policy admin_read on public.admin_invitations for select to authenticated using(private.has_permission('users.invite'));
drop policy if exists admin_read on public.security_events;create policy admin_read on public.security_events for select to authenticated using(private.has_permission('security.manage'));
drop policy if exists admin_read on public.admin_notifications;create policy admin_read on public.admin_notifications for select to authenticated using(user_id=(select auth.uid()) and private.has_permission('notifications.read'));
drop policy if exists admin_read on public.integration_settings;create policy admin_read on public.integration_settings for select to authenticated using(private.has_permission('integrations.manage'));
drop policy if exists menus_read on public.menu_items;
create policy menus_read on public.menu_items for select to anon using(is_active and deleted_at is null and (target_type<>'category' or exists(select 1 from public.categories c where c.id=category_id)));drop policy if exists menus_admin_read on public.menu_items;create policy menus_admin_read on public.menu_items for select to authenticated using((is_active and deleted_at is null) or (select private.has_permission('menus.manage')));
-- PIN hashes/proofs never leave the server boundary. Successful reauthentication is performed by the application against Supabase Auth.
create or replace function public.security_pin_state(p_user_id uuid) returns jsonb language sql stable security definer set search_path='' as $$ select jsonb_build_object('hash',(select pin_hash from private.account_pins where user_id=p_user_id),'epoch',coalesce(c.epoch,1),'required',coalesce(c.require_sensitive,true),'ttl_seconds',coalesce(c.ttl_seconds,600),'locked_until',c.locked_until,'failures',coalesce(c.failures,0)) from (select p_user_id as id) x left join private.pin_controls c on c.user_id=x.id $$;
create or replace function public.security_pin_attempt(p_user_id uuid,p_success boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare c private.pin_controls;
begin
 if private.permission_scope_for(p_user_id,'roles.manage') is null then raise exception 'FORBIDDEN';end if;
 insert into private.pin_controls(user_id) values(p_user_id) on conflict do nothing;select * into c from private.pin_controls where user_id=p_user_id for update;
 if c.locked_until>now() then return false;end if;
 if p_success then update private.pin_controls set failures=0,locked_until=null where user_id=p_user_id;return true;end if;
 update private.pin_controls set failures=failures+1,locked_until=now()+make_interval(secs=>least(900,power(2,least(c.failures,10))::int)) where user_id=p_user_id;
 insert into public.security_events(actor_id,event_type,result) values(p_user_id,'PIN_FAILURE','failure');return false;
end $$;
create or replace function public.security_save_pin(p_user_id uuid,p_hash text,p_ttl int,p_required boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if private.permission_scope_for(p_user_id,'roles.manage') is null or p_hash !~ '^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{128}$' or p_ttl not between 60 and 900 then raise exception 'INVALID_PIN_CONFIGURATION';end if;
 insert into private.account_pins(user_id,pin_hash) values(p_user_id,p_hash) on conflict(user_id) do update set pin_hash=excluded.pin_hash,updated_at=now();
 insert into private.pin_controls(user_id,epoch,ttl_seconds,require_sensitive) values(p_user_id,1,p_ttl,p_required) on conflict(user_id) do update set epoch=private.pin_controls.epoch+1,ttl_seconds=p_ttl,require_sensitive=p_required,failures=0,locked_until=null;
 insert into public.security_events(actor_id,event_type,result) values(p_user_id,'PIN_CHANGED','success');
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(p_user_id,'PIN_CHANGED','account',p_user_id::text);
end $$;
create or replace function public.security_create_proof(p_user_id uuid,p_session_id uuid,p_proof_hash text,p_strong boolean) returns int language plpgsql security definer set search_path='' as $$
declare c private.pin_controls;
begin
 if private.permission_scope_for(p_user_id,'roles.manage') is null or p_proof_hash !~ '^[a-f0-9]{64}$' or not exists(select 1 from auth.sessions where id=p_session_id and user_id=p_user_id and (not_after is null or not_after>now())) then raise exception 'FORBIDDEN';end if;
 select * into c from private.pin_controls where user_id=p_user_id for update;
 if not found or c.locked_until>now() or not exists(select 1 from private.account_pins where user_id=p_user_id) then raise exception 'PIN_LOCKED_OR_UNCONFIGURED';end if;
 insert into private.sensitive_proofs(proof_hash,user_id,session_id,epoch,expires_at,strong_until) values(p_proof_hash,p_user_id,p_session_id,c.epoch,now()+make_interval(secs=>c.ttl_seconds),case when p_strong then now()+interval '5 minutes' end);return c.ttl_seconds;
end $$;
