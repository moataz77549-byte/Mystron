
create or replace function public.admin_create_invitation(p_email text,p_role uuid,p_hash text,p_expires timestamptz,p_scope text,p_categories uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
declare invitation_id uuid;
begin
 perform private.require_permission('users.invite');
 perform private.check_delegated_scope(p_scope,p_categories,null);
 if not private.can_assign_role(auth.uid(),p_role) or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_email)>254 or lower(p_email)=(select lower(email) from auth.users where id=auth.uid()) or p_expires not between now()+interval '15 minutes' and now()+interval '7 days' or p_scope not in ('all','restricted') or cardinality(p_categories)>50 or exists(select 1 from unnest(p_categories) c where not exists(select 1 from public.categories where id=c and is_active and deleted_at is null)) then raise exception 'INVALID_INVITATION';end if;
 if exists(select 1 from public.admin_invitations where email=lower(p_email) and status='pending' and expires_at>now()) then raise exception 'INVITATION_EXISTS';end if;
 insert into public.admin_invitations(email,role_id,token_hash,expires_at,created_by,scope_mode,category_ids) values(lower(p_email),p_role,p_hash,p_expires,auth.uid(),p_scope,p_categories) returning id into invitation_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'INVITATION_CREATED','invitation',invitation_id::text);return invitation_id;
end $$;
create or replace function public.admin_invitation_action(p_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare item public.admin_invitations;
begin
 perform private.require_permission('users.invite');select * into item from public.admin_invitations where id=p_id for update;
 if not found or not private.can_assign_role(auth.uid(),item.role_id) then raise exception 'FORBIDDEN';end if;
 if p_action='revoke' then update public.admin_invitations set status='revoked' where id=p_id and status='pending';
 elsif p_action in ('sent','failed') then update public.admin_invitations set delivery_status=p_action where id=p_id and status='pending';else raise exception 'INVALID_ACTION';end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'INVITATION_'||upper(p_action),'invitation',p_id::text);
end $$;
create or replace function public.accept_admin_invitation(p_hash text) returns void language plpgsql security definer set search_path='' as $$
declare item public.admin_invitations;confirmed_email text;
begin
 select lower(email) into confirmed_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if confirmed_email is null or not exists(select 1 from auth.sessions where id=nullif(auth.jwt()->>'session_id','')::uuid and user_id=auth.uid() and (not_after is null or not_after>now()) and not exists(select 1 from private.revoked_admin_sessions x where x.session_id=auth.sessions.id)) then raise exception 'VERIFIED_IDENTITY_REQUIRED';end if;
 select * into item from public.admin_invitations where token_hash=p_hash for update;
 if not found or item.status<>'pending' or item.expires_at<=now() or item.email<>confirmed_email or not private.can_assign_role(item.created_by,item.role_id) then raise exception 'INVALID_OR_EXPIRED_INVITATION';end if;
 if exists(select 1 from public.admin_memberships where user_id=auth.uid() and not enabled) or exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=auth.uid() and r.name='OWNER' and ur.is_active) then raise exception 'ACCOUNT_PROTECTED_OR_DISABLED';end if;
 insert into public.admin_memberships(user_id,assigned_by,scope_mode,category_ids) values(auth.uid(),item.created_by,item.scope_mode,item.category_ids) on conflict(user_id) do update set scope_mode=item.scope_mode,category_ids=item.category_ids;
 insert into public.user_roles(user_id,role_id,granted_by) values(auth.uid(),item.role_id,item.created_by) on conflict(user_id,role_id) do update set is_active=true,granted_by=item.created_by,granted_at=now();
 update public.admin_invitations set status='accepted',accepted_by=auth.uid(),accepted_at=now() where id=item.id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'INVITATION_ACCEPTED','invitation',item.id::text);
end $$;
revoke all on function public.admin_update_user(uuid,uuid,boolean,text,uuid[],boolean),public.admin_set_role_permission(uuid,text,text,boolean),public.admin_set_user_permission(uuid,text,text,text,boolean),public.admin_create_invitation(text,uuid,text,timestamptz,text,uuid[]),public.admin_invitation_action(uuid,text),public.accept_admin_invitation(text) from public,anon;
grant execute on function public.admin_update_user(uuid,uuid,boolean,text,uuid[],boolean),public.admin_set_role_permission(uuid,text,text,boolean),public.admin_set_user_permission(uuid,text,text,text,boolean),public.admin_create_invitation(text,uuid,text,timestamptz,text,uuid[]),public.admin_invitation_action(uuid,text),public.accept_admin_invitation(text) to authenticated;
