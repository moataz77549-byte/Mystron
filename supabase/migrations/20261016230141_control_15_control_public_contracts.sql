

-- Seed only absent configuration; preserve existing publishing policy.
insert into public.site_settings(key,value,is_public) values('identity','{"name":"ما يسطرون","description":"مساحة للمعرفة والحكاية","footer":"© معتز العلقمي — اليمن، تعز — 2026م.","logo_asset_id":null,"favicon_asset_id":null,"og_asset_id":null,"palette":{"navy":"#111D31","gold":"#D5A96A","ivory":"#F7F3EB","teal":"#267E81","burgundy":"#8F4D52"},"dark_palette":{"background":"#101926","foreground":"#F7F3EB","surface":"#172437","muted":"#BDC6D1","border":"#354255"},"font":"IBM Plex Sans Arabic","default_theme":"system","socials":[]}'::jsonb,true) on conflict(key) do nothing;
insert into public.site_settings(key,value,is_public) values('home','{"sections":[{"id":"00000000-0000-4000-8000-000000000001","type":"hero","title":"لكلّ فكرةٍ سطر، ولكلّ سطرٍ أفق.","description":"في ما يسطرون نقرأ العالم من زوايا متعددة، ونمنح المعرفة والحكاية مساحة تستحقها.","enabled":true,"hide_empty":false,"limit":1},{"id":"00000000-0000-4000-8000-000000000002","type":"featured","title":"اختيار التحرير","enabled":true,"hide_empty":true,"limit":1},{"id":"00000000-0000-4000-8000-000000000003","type":"latest","title":"أحدث ما سُطّر","enabled":true,"hide_empty":false,"limit":12},{"id":"00000000-0000-4000-8000-000000000004","type":"popular","title":"الأكثر قراءة هذا الأسبوع","enabled":true,"hide_empty":true,"limit":3}]}'::jsonb,true) on conflict(key) do nothing;
insert into public.site_settings(key,value,is_public) values('publishing','{"default_comments":true,"comments_close_days":30,"timezone":"Asia/Aden","default_visibility":"public","view_retention_days":30}'::jsonb,false) on conflict(key) do nothing;
insert into public.site_settings(key,value,is_public) values('comments','{"enabled":true,"pre_moderation":true,"replies":true,"max_depth":3,"limit":5,"window_seconds":60,"blocked_words":[],"blocked_emails":[]}'::jsonb,false) on conflict(key) do nothing;
insert into public.site_settings(key,value,is_public) values('seo','{"title_suffix":"ما يسطرون","description":"مساحة عربية للمعرفة والثقافة والحياة."}'::jsonb,true) on conflict(key) do nothing;
insert into public.site_settings(key,value,is_public) values('security','{"session_max_age_minutes":480,"event_retention_days":90,"audit_retention_days":365}'::jsonb,false) on conflict(key) do nothing;
insert into public.site_settings(key,value,is_public) values('maintenance','{"enabled":false,"message":"نُجري صيانة مؤقتة للمنصة. نعود إليكم قريباً.","until":null}'::jsonb,true) on conflict(key) do nothing;
-- An administrator restricted to categories cannot delegate a wider scope.
create or replace function private.check_delegated_scope(p_mode text,p_categories uuid[],p_target uuid default null) returns void language plpgsql stable security definer set search_path='' as $$
declare caller public.admin_memberships;target public.admin_memberships;
begin
 select * into caller from public.admin_memberships where user_id=auth.uid();
 if caller.scope_mode='restricted' then
 if p_mode<>'restricted' or not p_categories<@caller.category_ids then raise exception 'SCOPE_OUT_OF_AUTHORITY' using errcode='42501';end if;
 if p_target is not null then select * into target from public.admin_memberships where user_id=p_target;if target.scope_mode<>'restricted' or not target.category_ids<@caller.category_ids then raise exception 'TARGET_OUT_OF_AUTHORITY' using errcode='42501';end if;end if;
 end if;
end $$;
revoke all on function private.check_delegated_scope(text,uuid[],uuid) from public,anon,authenticated;
-- Restrict audit rows to the actor's scope, or their own actions.
drop policy if exists staff_read on public.audit_logs;
create policy staff_read on public.audit_logs for select to authenticated using((select private.has_permission('audit.read')) and (actor_id=(select auth.uid()) or exists(select 1 from public.admin_memberships m where m.user_id=(select auth.uid()) and m.scope_mode='all') or (entity_type='post' and exists(select 1 from public.posts p where p.id::text=entity_id and private.can_post(p,'posts.read')))));
-- Keep publishing settings on the same validation/version/audit path.
create or replace function public.cms_publishing_settings(p_value jsonb) returns void language plpgsql security definer set search_path='' as $$
begin perform public.admin_update_setting('publishing',p_value,(select version from public.site_settings where key='publishing'));end $$;
create or replace function private.security_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.event_type in ('PIN_FAILURE','LOGIN_FAILURE','ROLE_CHANGED','USER_DISABLED','SETTINGS_UPDATED','INTEGRATION_CHANGED') then
 insert into public.admin_notifications(user_id,kind,title,href,priority)
 select ur.user_id,'security','حدث أمني يحتاج مراجعة: '||new.event_type,'/admin/security',case when new.result='failure' then 'high' else 'normal' end from public.user_roles ur join public.roles r on r.id=ur.role_id join public.admin_memberships m on m.user_id=ur.user_id where r.name='OWNER' and ur.is_active and m.enabled;
 end if;return new;
end $$;
revoke all on function private.security_notification() from public,anon,authenticated;
drop trigger if exists security_notification on public.security_events;
create trigger security_notification after insert on public.security_events for each row execute function private.security_notification();
create or replace function private.control_retention() returns void language plpgsql security definer set search_path='' as $$
declare policy jsonb;
begin
 select value into policy from public.site_settings where key='security';
 delete from private.sensitive_proofs where expires_at<now();
 delete from public.security_events where created_at<now()-make_interval(days=>coalesce((policy->>'event_retention_days')::int,90));
 delete from public.audit_logs where created_at<now()-make_interval(days=>coalesce((policy->>'audit_retention_days')::int,365));
 delete from public.admin_notifications where created_at<now()-interval '90 days';
 delete from public.admin_invitations where expires_at<now()-interval '30 days';
end $$;
revoke all on function private.control_retention() from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_namespace where nspname='cron') then perform cron.schedule('maystroon-control-retention','33 1 * * *','select private.control_retention();');end if;end $$;

alter table public.ticker_items drop constraint if exists ticker_items_placement_check;
alter table public.ticker_items add constraint ticker_items_placement_check check(placement in ('ticker','top','home','article','article_after','sidebar','footer'));
create or replace function private.audit_activity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.admin_memberships set last_activity_at=now() where user_id=new.actor_id;
 if new.action='ROLE_CHANGED' and new.entity_type in ('role','user_permission') then insert into public.security_events(actor_id,event_type,result,request_id) values(new.actor_id,'ROLE_CHANGED',new.result,new.request_id);end if;
 if new.action in ('post_publish','post_delete') then insert into public.security_events(actor_id,event_type,result,request_id) values(new.actor_id,case when new.action='post_publish' then 'POST_PUBLISHED' else 'POST_DELETED' end,new.result,new.request_id);end if;
 return new;
end $$;
revoke all on function private.audit_activity() from public,anon,authenticated;
drop trigger if exists audit_activity on public.audit_logs;create trigger audit_activity after insert on public.audit_logs for each row execute function private.audit_activity();
create or replace function public.admin_can_post(p_id uuid,p_permission text) returns boolean language sql stable security definer set search_path='' as $$ select coalesce((select private.can_post(p,p_permission) from public.posts p where p.id=p_id),false) $$;
create or replace function public.admin_post_list(p_page int default 1,p_q text default '',p_status text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_permission('posts.read') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_page not between 1 and 10000 or length(p_q)>100 or p_status not in ('','draft','review','scheduled','published','unpublished','archived','trash') then raise exception 'INVALID_QUERY';end if;
 return jsonb_build_object('rows',coalesce((select jsonb_agg(x) from(select p.id,p.title,p.slug,p.status,p.version,p.deleted_at,p.updated_at,private.can_post(p,'posts.update') and(p.status<>'published' or private.has_permission('posts.publish')) can_update,private.can_post(p,'posts.delete') and(p.status<>'published' or private.has_permission('posts.publish')) can_delete,private.can_post(p,'posts.publish') can_publish,private.has_permission('posts.create') can_duplicate from public.posts p where private.can_post(p,'posts.read') and (p_q='' or strpos(lower(p.title),lower(p_q))>0) and (p_status='' or(p_status='trash' and p.deleted_at is not null) or(p_status<>'trash' and p.status=p_status and p.deleted_at is null)) order by p.updated_at desc,p.id limit 100 offset(p_page-1)*100) x),'[]'::jsonb),'total',(select count(*) from public.posts p where private.can_post(p,'posts.read') and(p_q='' or strpos(lower(p.title),lower(p_q))>0) and(p_status='' or(p_status='trash' and p.deleted_at is not null) or(p_status<>'trash' and p.status=p_status and p.deleted_at is null))));
end $$;
revoke all on function public.admin_can_post(uuid,text),public.admin_post_list(int,text,text) from public,anon;
grant execute on function public.admin_can_post(uuid,text),public.admin_post_list(int,text,text) to authenticated;
