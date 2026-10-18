
revoke all on function public.admin_update_setting(text,jsonb,bigint) from public,anon;
grant execute on function public.admin_update_setting(text,jsonb,bigint) to authenticated;
-- Session expiry is enforced even while Auth access tokens are still valid.
create or replace function private.actor_active(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(p_user=auth.uid() and exists(select 1 from auth.users u join public.admin_memberships a on a.user_id=u.id where u.id=p_user and u.email_confirmed_at is not null and a.enabled and to_timestamp(coalesce(nullif(auth.jwt()->>'iat',''),'0')::double precision)>=a.revoked_before and exists(select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=u.id and (s.not_after is null or s.not_after>now()) and s.created_at>now()-make_interval(mins=>coalesce((select (value->>'session_max_age_minutes')::int from public.site_settings where key='security'),480)) and not exists(select 1 from private.revoked_admin_sessions x where x.session_id=s.id))),false)
$$;
drop policy if exists editorial_read on storage.objects;
create policy editorial_read on storage.objects for select to authenticated using(bucket_id='editorial' and (select private.has_permission('media.manage')) and (split_part(name,'/',1)=(select auth.uid())::text or (select private.current_permission_scope('media.manage'))='all'));
drop policy if exists staff_read on public.post_view_daily;
create policy staff_read on public.post_view_daily for select to authenticated using(exists(select 1 from public.posts p where p.id=post_id and ((p.status='published' and p.visibility='public' and p.deleted_at is null and p.published_at<=now()) or private.can_post(p,'analytics.read'))));
drop policy if exists staff_read on public.post_views; -- raw visitor identifiers remain server-only
revoke select on public.post_views from authenticated;
-- Signed-in administrators see roles for assignment; anonymous users do not.
drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles for select to authenticated using((select private.actor_active(auth.uid())));
grant execute on function private.actor_active(uuid) to authenticated;
-- Public settings assets are readable only while referenced by the public identity document.
drop policy if exists identity_media on public.media_assets;
create policy identity_media on public.media_assets for select to anon,authenticated using(deleted_at is null and visibility='public' and exists(select 1 from public.site_settings s where s.key='identity' and s.is_public and media_assets.id::text in(s.value->>'logo_asset_id',s.value->>'favicon_asset_id',s.value->>'og_asset_id')));
create or replace function public.admin_save_menu(p_id uuid,p_value jsonb,p_delete boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare parent uuid;ancestor uuid;level int=0;item_id uuid;
begin
 perform private.require_permission('menus.manage');
 if p_delete then
 if exists(select 1 from public.menu_items where parent_id=p_id and deleted_at is null) then raise exception 'MENU_HAS_CHILDREN';end if;
 update public.menu_items set deleted_at=now() where id=p_id;item_id=p_id;
 else
 if not private.allowed_keys(p_value,array['parent_id','location','label','target_type','href','category_id','is_active','sort_order']) or not(p_value ?& array['location','label','target_type','is_active','sort_order']) or length(p_value->>'label') not between 1 and 100 or p_value->>'location' not in ('header','mobile','footer','secondary') or p_value->>'target_type' not in ('page','category','external') or jsonb_typeof(p_value->'is_active')<>'boolean' or abs((p_value->>'sort_order')::int)>10000 then raise exception 'INVALID_MENU';end if;
 if p_value->>'target_type'='external' and (not private.safe_url(p_value->>'href') or p_value->>'href' not like 'https://%') then raise exception 'INVALID_URL';end if;
 if p_value->>'target_type'='page' and p_value->>'href' not in ('/','/about','/privacy','/search') then raise exception 'INVALID_PAGE';end if;
 if p_value->>'target_type'='category' and not exists(select 1 from public.categories where id=(p_value->>'category_id')::uuid and is_active and deleted_at is null) then raise exception 'INVALID_CATEGORY';end if;
 parent=nullif(p_value->>'parent_id','')::uuid;ancestor=parent;
 while ancestor is not null loop
 level=level+1;if ancestor=p_id or level>3 then raise exception 'MENU_CYCLE_OR_DEPTH';end if;
 select parent_id into ancestor from public.menu_items where id=ancestor and deleted_at is null and location=p_value->>'location';if not found then raise exception 'INVALID_PARENT';end if;
 end loop;
 if p_id is null then insert into public.menu_items(location,label,target_type,href,category_id,parent_id,is_active,sort_order) values(p_value->>'location',p_value->>'label',p_value->>'target_type',p_value->>'href',nullif(p_value->>'category_id','')::uuid,parent,(p_value->>'is_active')::boolean,(p_value->>'sort_order')::int) returning id into item_id;
 else update public.menu_items set location=p_value->>'location',label=p_value->>'label',target_type=p_value->>'target_type',href=p_value->>'href',category_id=nullif(p_value->>'category_id','')::uuid,parent_id=parent,is_active=(p_value->>'is_active')::boolean,sort_order=(p_value->>'sort_order')::int where id=p_id and deleted_at is null returning id into item_id;if not found then raise exception 'NOT_FOUND';end if;end if;
 end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),case when p_delete then 'MENU_DELETED' else 'MENU_UPDATED' end,'menu',item_id::text);return item_id;
end $$;
create or replace function public.admin_notification_action(p_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_permission('notifications.read');
 if p_action not in ('read','unread','archive') then raise exception 'INVALID_ACTION';end if;
 update public.admin_notifications set read_at=case when p_action='read' then now() when p_action='unread' then null else read_at end,archived_at=case when p_action='archive' then now() else archived_at end where id=p_id and user_id=auth.uid();if not found then raise exception 'NOT_FOUND';end if;
end $$;
create or replace function public.admin_save_integration(p_id text,p_enabled boolean,p_config jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_permission('integrations.manage');
 -- Secret material is never accepted. Providers remain unconfigured until Stage 4.
 if p_id not in ('supabase','vercel','telegram','botkeep','ai','analytics') or not private.allowed_keys(p_config,array['label','note']) or octet_length(p_config::text)>2000 or (p_config?'label' and (jsonb_typeof(p_config->'label')<>'string' or length(p_config->>'label')>100)) or (p_config?'note' and (jsonb_typeof(p_config->'note')<>'string' or length(p_config->>'note')>500)) then raise exception 'INVALID_INTEGRATION';end if;
 insert into public.integration_settings(id,enabled,config) values(p_id,p_enabled,p_config) on conflict(id) do update set enabled=p_enabled,config=p_config,updated_at=now();
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'INTEGRATION_CHANGED','integration',p_id);
 insert into public.security_events(actor_id,event_type,result) values(auth.uid(),'INTEGRATION_CHANGED','success');
end $$;
create or replace function public.admin_sessions() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_permission('security.manage') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 return coalesce((select jsonb_agg(x) from(select s.id,s.user_id,s.created_at,s.updated_at,s.aal,s.not_after,exists(select 1 from private.revoked_admin_sessions r where r.session_id=s.id) as admin_revoked from auth.sessions s join public.admin_memberships m on m.user_id=s.user_id order by s.created_at desc limit 50) x),'[]'::jsonb);
end $$;
create or replace function public.admin_users(p_page int default 1,p_search text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_permission('users.manage') and not private.has_permission('users.invite') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_page not between 1 and 10000 or length(p_search)>100 then raise exception 'INVALID_QUERY';end if;
 return jsonb_build_object('total',(select count(*) from public.admin_memberships m join auth.users u on u.id=m.user_id where private.scope_contains_user(m.user_id) and u.email ilike '%'||p_search||'%'),'rows',coalesce((select jsonb_agg(x) from(select m.*,u.email,u.email_confirmed_at,(select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name)) from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=m.user_id and ur.is_active) roles from public.admin_memberships m join auth.users u on u.id=m.user_id where private.scope_contains_user(m.user_id) and u.email ilike '%'||p_search||'%' order by m.assigned_at desc,m.user_id limit 25 offset(p_page-1)*25) x),'[]'::jsonb));
end $$;
revoke all on function public.admin_save_menu(uuid,jsonb,boolean),public.admin_notification_action(uuid,text),public.admin_save_integration(text,boolean,jsonb),public.admin_sessions(),public.admin_users(int,text) from public,anon;
grant execute on function public.admin_save_menu(uuid,jsonb,boolean),public.admin_notification_action(uuid,text),public.admin_save_integration(text,boolean,jsonb),public.admin_sessions(),public.admin_users(int,text) to authenticated;
