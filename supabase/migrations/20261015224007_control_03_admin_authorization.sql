
insert into public.role_permissions(role_id,permission_key,scope) select id,'dashboard.read','all' from public.roles where name='EDITOR' on conflict do nothing;
insert into public.role_permissions(role_id,permission_key,scope) select id,'notifications.read','all' from public.roles where name='EDITOR' on conflict do nothing;
insert into public.role_permissions(role_id,permission_key,scope) select id,'posts.create','all' from public.roles where name='AUTHOR' on conflict do nothing;
insert into public.role_permissions(role_id,permission_key,scope) select id,'posts.read','own' from public.roles where name='AUTHOR' on conflict do nothing;
insert into public.role_permissions(role_id,permission_key,scope) select id,'posts.update','own' from public.roles where name='AUTHOR' on conflict do nothing;
insert into public.role_permissions(role_id,permission_key,scope) select id,'posts.delete','own' from public.roles where name='AUTHOR' on conflict do nothing;
insert into public.role_permissions(role_id,permission_key,scope) select id,'media.manage','own' from public.roles where name='AUTHOR' on conflict do nothing;
insert into public.role_permissions(role_id,permission_key,scope) select id,'dashboard.read','all' from public.roles where name='AUTHOR' on conflict do nothing;
insert into public.role_permissions(role_id,permission_key,scope) select id,'notifications.read','all' from public.roles where name='AUTHOR' on conflict do nothing;
insert into public.role_permissions(role_id,permission_key,scope) select id,'comments.moderate','all' from public.roles where name='MODERATOR' on conflict do nothing;
insert into public.role_permissions(role_id,permission_key,scope) select id,'dashboard.read','all' from public.roles where name='MODERATOR' on conflict do nothing;
insert into public.role_permissions(role_id,permission_key,scope) select id,'notifications.read','all' from public.roles where name='MODERATOR' on conflict do nothing;
insert into public.role_permissions(role_id,permission_key,scope) select id,'posts.read','all' from public.roles where name='VIEWER' on conflict do nothing;
insert into public.role_permissions(role_id,permission_key,scope) select id,'dashboard.read','all' from public.roles where name='VIEWER' on conflict do nothing;
insert into public.admin_memberships(user_id) select distinct user_id from public.user_roles where is_active on conflict do nothing;
create or replace function private.ensure_membership() returns trigger language plpgsql security definer set search_path='' as $$ begin if new.is_active then insert into public.admin_memberships(user_id,assigned_by) values(new.user_id,new.granted_by) on conflict do nothing;end if;return new;end $$;
revoke all on function private.ensure_membership() from public,anon,authenticated;
drop trigger if exists ensure_membership on public.user_roles;
create trigger ensure_membership after insert on public.user_roles for each row execute function private.ensure_membership();
-- Authorization never trusts user_metadata or role claims cached in a JWT.
create or replace function private.actor_active(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$ select p_user=auth.uid() and exists(select 1 from auth.users u join public.admin_memberships a on a.user_id=u.id where u.id=p_user and u.email_confirmed_at is not null and a.enabled and to_timestamp(coalesce(nullif(auth.jwt()->>'iat',''),'0')::double precision)>=a.revoked_before and exists(select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=u.id and (s.not_after is null or s.not_after>now()))) $$;
revoke all on function private.actor_active(uuid) from public,anon,authenticated;
create or replace function private.permission_scope_for(p_user uuid,p_permission text) returns text language plpgsql stable security definer set search_path='' as $$
declare mode text;
begin
 if not exists(select 1 from public.admin_memberships a join auth.users u on u.id=a.user_id where a.user_id=p_user and a.enabled and u.email_confirmed_at is not null) then return null;end if;
 if exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=p_user and ur.is_active and r.name='OWNER') then return 'all';end if;
 if p_permission in ('roles.manage','security.manage','integrations.manage','maintenance.manage') then return null;end if;
 if exists(select 1 from public.user_permissions where user_id=p_user and permission_key=p_permission and enabled and effect='deny') then return null;end if;
 select scope into mode from public.user_permissions where user_id=p_user and permission_key=p_permission and enabled and effect='allow';if mode is not null then return mode;end if;
 select case when bool_or(rp.scope='all') then 'all' else 'own' end into mode from public.user_roles ur join public.role_permissions rp on rp.role_id=ur.role_id where ur.user_id=p_user and ur.is_active and rp.permission_key=p_permission and rp.enabled having count(*)>0;return mode;
end $$;
revoke all on function private.permission_scope_for(uuid,text) from public,anon,authenticated;
create or replace function private.has_permission(p_permission text) returns boolean language sql stable security definer set search_path='' as $$ select private.actor_active(auth.uid()) and private.permission_scope_for(auth.uid(),p_permission) is not null $$;
revoke all on function private.has_permission(text) from public,anon;
grant execute on function private.has_permission(text) to authenticated;
create or replace function private.has_role(allowed text[]) returns boolean language sql stable security definer set search_path='' as $$ select private.actor_active(auth.uid()) and exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=auth.uid() and ur.is_active and r.name=any(allowed)) $$;
create or replace function private.can_post(item public.posts,p_permission text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare mode text;a public.admin_memberships;
begin
 if not private.actor_active(auth.uid()) then return false;end if;mode=private.permission_scope_for(auth.uid(),p_permission);if mode is null then return false;end if;
 if mode='own' and (item.created_by is distinct from auth.uid() or (p_permission in ('posts.update','posts.delete') and item.status not in ('draft','unpublished'))) then return false;end if;
 select * into a from public.admin_memberships where user_id=auth.uid();
 if a.scope_mode='restricted' and (exists(select 1 from public.post_categories pc where pc.post_id=item.id and not pc.category_id=any(a.category_ids)) or (not exists(select 1 from public.post_categories pc where pc.post_id=item.id) and item.created_by is distinct from auth.uid())) then return false;end if;return true;
end $$;
revoke all on function private.can_post(public.posts,text) from public,anon;
grant execute on function private.can_post(public.posts,text) to authenticated;
create or replace function private.may_edit(p public.posts) returns boolean language sql stable security definer set search_path='' as $$ select private.can_post(p,'posts.update') $$;
create or replace function private.is_staff() returns boolean language sql stable security definer set search_path='' as $$ select private.has_permission('users.manage') $$;
create or replace function private.require_sensitive(p_permission text) returns void language plpgsql security definer set search_path='' as $$
declare control private.pin_controls;proof text;sid uuid=nullif(auth.jwt()->>'session_id','')::uuid;
begin
 if not private.has_role(array['OWNER']) then return;end if;
 if p_permission not in ('roles.manage','users.invite','users.manage','settings.update','security.manage','integrations.manage','menus.manage','announcements.manage','maintenance.manage') then return;end if;
 select * into control from private.pin_controls where user_id=auth.uid();
 if control.user_id is null or not exists(select 1 from private.account_pins where user_id=auth.uid()) then raise exception 'PIN_SETUP_REQUIRED' using errcode='42501';end if;
 if not control.require_sensitive and p_permission not in ('roles.manage','security.manage') then return;end if;
 proof=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-maystroon-proof';
 if not exists(select 1 from private.sensitive_proofs p where p.proof_hash=proof and p.user_id=auth.uid() and p.session_id=sid and p.epoch=control.epoch and p.expires_at>now() and (p_permission not in ('roles.manage','security.manage') or p.strong_until>now())) then raise exception 'PIN_VERIFICATION_REQUIRED' using errcode='42501';end if;
end $$;
revoke all on function private.require_sensitive(text) from public,anon,authenticated;
create or replace function private.require_permission(p_permission text) returns void language plpgsql security definer set search_path='' as $$ begin if not private.has_permission(p_permission) then raise exception 'FORBIDDEN' using errcode='42501';end if;perform private.require_sensitive(p_permission);end $$;
revoke all on function private.require_permission(text) from public,anon,authenticated;
create or replace function public.admin_identity() returns jsonb language sql stable security definer set search_path='' as $$ select jsonb_build_object('active',private.actor_active(auth.uid()),'roles',coalesce((select jsonb_agg(r.name) from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=auth.uid() and ur.is_active),'[]'::jsonb),'permissions',coalesce((select jsonb_object_agg(key,private.permission_scope_for(auth.uid(),key)) from public.permissions where private.actor_active(auth.uid()) and private.permission_scope_for(auth.uid(),key) is not null),'{}'::jsonb),'scope',(select jsonb_build_object('mode',scope_mode,'category_ids',category_ids) from public.admin_memberships where user_id=auth.uid()),'pin_configured',exists(select 1 from private.account_pins where user_id=auth.uid())) $$;

revoke all on function public.admin_identity() from public,anon;
grant execute on function public.admin_identity() to authenticated;
