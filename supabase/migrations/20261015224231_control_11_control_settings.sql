
create or replace function private.publish_due() returns integer language plpgsql security definer set search_path='' as $$
declare item public.posts;published int=0;
begin
 for item in select * from public.posts where status='scheduled' and scheduled_at<=now() and deleted_at is null and (next_schedule_attempt_at is null or next_schedule_attempt_at<=now()) order by scheduled_at for update skip locked loop
 if private.publication_valid(item) and private.permission_scope_for(item.scheduled_by,'posts.publish') is not null and not exists(select 1 from public.admin_memberships a where a.user_id=item.scheduled_by and a.scope_mode='restricted' and exists(select 1 from public.post_categories pc where pc.post_id=item.id and not pc.category_id=any(a.category_ids))) then
 insert into public.post_revisions(post_id,editor_id,snapshot) values(item.id,item.scheduled_by,private.post_snapshot(item));
 update public.posts set status='published',comments_close_at=coalesce(comments_close_at,case when coalesce((select (value->>'comments_close_days')::int from public.site_settings where key='publishing'),0)>0 then now()+make_interval(days => coalesce((select (value->>'comments_close_days')::int from public.site_settings where key='publishing'),0)) end),published_at=coalesce(published_at,now()),scheduled_at=null,version=version+1,last_schedule_error=null where id=item.id;
 update public.media_assets set visibility='public' where id in(select asset_id from public.post_media where post_id=item.id) or id in(item.cover_asset_id,item.thumbnail_asset_id,item.share_asset_id);
 insert into public.publishing_runs(post_id,status,trigger) values(item.id,'success','scheduled');
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(item.scheduled_by,'post_published_scheduled','post',item.id::text);published=published+1;
 else
 update public.posts set schedule_attempts=schedule_attempts+1,next_schedule_attempt_at=now()+interval '15 minutes',last_schedule_error='Publication validation or publisher role failed',status=case when schedule_attempts>=4 then 'review' else status end where id=item.id;
 insert into public.publishing_runs(post_id,status,reason,trigger) values(item.id,'failed','Publication validation or publisher role failed','scheduled');
 end if;end loop;return published;
end $$;
drop policy if exists authenticated_read on public.posts;create policy authenticated_read on public.posts for select to authenticated using((status='published' and visibility='public' and deleted_at is null and published_at<=now()) or private.can_post(posts,'posts.read'));
drop policy if exists authenticated_read on public.categories;create policy authenticated_read on public.categories for select to authenticated using((is_active and deleted_at is null) or private.has_permission('categories.manage'));
drop policy if exists authenticated_read on public.authors;create policy authenticated_read on public.authors for select to authenticated using((is_active and deleted_at is null) or private.has_permission('authors.manage'));
drop policy if exists authenticated_read on public.site_settings;create policy authenticated_read on public.site_settings for select to authenticated using(is_public or private.has_permission('settings.read'));
drop policy if exists authenticated_read on public.post_categories;create policy authenticated_read on public.post_categories for select to authenticated using(exists(select 1 from public.posts p where p.id=post_id));
drop policy if exists authenticated_read on public.ticker_items;create policy authenticated_read on public.ticker_items for select to authenticated using((is_active and starts_at<=now() and (ends_at is null or ends_at>now())) or private.has_permission('announcements.manage'));
drop policy if exists staff_read on public.comments;
create policy staff_read on public.comments for select to authenticated using(exists(select 1 from public.posts p where p.id=post_id and private.can_post(p,'comments.moderate')));
drop policy if exists own_revisions on public.post_revisions;
create policy own_revisions on public.post_revisions for select to authenticated using(exists(select 1 from public.posts p where p.id=post_id and private.can_post(p,'posts.update')));
create or replace function private.current_permission_scope(p_permission text) returns text language sql stable security definer set search_path='' as $$ select case when private.actor_active(auth.uid()) then private.permission_scope_for(auth.uid(),p_permission) end $$;
revoke all on function private.current_permission_scope(text) from public,anon;
grant execute on function private.current_permission_scope(text) to authenticated;
drop policy if exists media_owner_read on public.media_assets;
create policy media_owner_read on public.media_assets for select to authenticated using(private.has_permission('media.manage') and (owner_id=(select auth.uid()) or (select private.current_permission_scope('media.manage'))='all'));
drop policy if exists staff_read on public.audit_logs;
create policy staff_read on public.audit_logs for select to authenticated using((select private.has_permission('audit.read')));
drop policy if exists staff_read on public.publishing_runs;
create policy staff_read on public.publishing_runs for select to authenticated using(exists(select 1 from public.posts p where p.id=post_id and private.can_post(p,'posts.read')));
drop policy if exists staff_read on public.comment_reports;
create policy staff_read on public.comment_reports for select to authenticated using(exists(select 1 from public.comments c join public.posts p on p.id=c.post_id where c.id=comment_id and private.can_post(p,'comments.moderate')));
drop policy if exists editorial_upload on storage.objects;
create policy editorial_upload on storage.objects for insert to authenticated with check(bucket_id='editorial' and split_part(name,'/',1)=(select auth.uid())::text and (select private.has_permission('media.manage')));
alter table public.site_settings add column if not exists version bigint not null default 1;
create or replace function private.allowed_keys(value jsonb,allowed text[]) returns boolean language sql immutable set search_path='' as $$ select jsonb_typeof(value)='object' and not exists(select 1 from jsonb_object_keys(value) k where not k=any(allowed)) $$;
create or replace function private.safe_url(value text,relative boolean default false) returns boolean language sql immutable set search_path='' as $$ select value is not null and length(value)<=2000 and value !~ '[[:cntrl:]]' and (value ~ '^https://[^[:space:]]+$' or (relative and value ~ '^/([^/]|$)' and value !~ '^/\\')) $$;
revoke all on function private.allowed_keys(jsonb,text[]),private.safe_url(text,boolean) from public,anon,authenticated;
