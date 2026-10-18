
create or replace function public.cms_transition_post(p_id uuid,p_action text,p_expected_version bigint,p_scheduled_at timestamptz default null) returns public.posts language plpgsql security definer set search_path='' as $$
declare item public.posts;new_id uuid;actor uuid=auth.uid();publisher boolean;permission text;rev public.post_revisions;
begin
 if not private.actor_active(auth.uid()) then raise exception 'FORBIDDEN';end if;permission=case when p_action in ('publish','unpublished','archived') then 'posts.publish' when p_action='scheduled' then 'posts.schedule' when p_action in ('delete','restore') then 'posts.delete' when p_action='duplicate' then 'posts.create' else 'posts.update' end;perform private.require_permission(permission);
 publisher=private.has_permission('posts.publish');
 select * into item from public.posts where id=p_id for update;if not found then raise exception 'NOT_FOUND';end if;
 if item.version<>p_expected_version then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;
 if (item.status='published' and p_action<>'duplicate' and not private.has_permission('posts.publish')) or not private.can_post(item,permission) or (p_action='duplicate' and not private.can_post(item,'posts.read')) or (p_action='scheduled' and not private.can_post(item,'posts.publish')) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if item.deleted_at is not null and p_action<>'restore' then raise exception 'POST_DELETED';end if;
 insert into public.post_revisions(post_id,editor_id,snapshot) values(item.id,actor,private.post_snapshot(item));
 if p_action='duplicate' then
 new_id=gen_random_uuid();insert into public.posts(id,title,slug,subtitle,excerpt,content,content_json,content_html,author_id,primary_category_id,cover_asset_id,thumbnail_asset_id,share_asset_id,tags,sources,created_by)
 values(new_id,item.title||' — نسخة','draft-'||new_id::text,item.subtitle,item.excerpt,item.content,item.content_json,item.content_html,item.author_id,item.primary_category_id,item.cover_asset_id,item.thumbnail_asset_id,item.share_asset_id,item.tags,item.sources,actor);
 insert into public.post_categories select new_id,category_id from public.post_categories where post_id=item.id;
 insert into public.post_media select new_id,asset_id from public.post_media where post_id=item.id;
 select * into item from public.posts where id=new_id;
 else
 if p_action in ('publish','scheduled') and not private.publication_valid(item) then raise exception 'PUBLICATION_INCOMPLETE';end if;
 if p_action='scheduled' and (p_scheduled_at is null or p_scheduled_at<=now()) then raise exception 'INVALID_SCHEDULE';end if;
 if p_action='publish' then update public.posts set status='published',comments_close_at=coalesce(comments_close_at,case when coalesce((select (value->>'comments_close_days')::int from public.site_settings where key='publishing'),0)>0 then now()+make_interval(days => coalesce((select (value->>'comments_close_days')::int from public.site_settings where key='publishing'),0)) end),published_at=coalesce(published_at,now()),scheduled_at=null,scheduled_by=null,version=version+1 where id=p_id;
 elsif p_action='scheduled' then update public.posts set status='scheduled',scheduled_at=p_scheduled_at,scheduled_by=actor,schedule_attempts=0,next_schedule_attempt_at=null,last_schedule_error=null,version=version+1 where id=p_id;
 elsif p_action in ('draft','review','archived','unpublished') then update public.posts set status=p_action,scheduled_at=null,scheduled_by=null,version=version+1 where id=p_id;
 elsif p_action='delete' then update public.posts set deleted_at=now(),scheduled_at=null,version=version+1 where id=p_id;
 elsif p_action='restore' then update public.posts set deleted_at=null,status='draft',scheduled_at=null,version=version+1 where id=p_id;
 else raise exception 'INVALID_ACTION';end if;
 select * into item from public.posts where id=p_id;
 if p_action='publish' then
 update public.media_assets set visibility='public' where id in(select asset_id from public.post_media where post_id=p_id) or id in(item.cover_asset_id,item.thumbnail_asset_id,item.share_asset_id);
 insert into public.publishing_runs(post_id,status,trigger) values(p_id,'success','manual');end if;
 end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(actor,'post_'||p_action,'post',item.id::text);return item;
end $$;
create or replace function public.cms_restore_revision(p_revision_id uuid,p_expected_version bigint) returns public.posts language plpgsql security definer set search_path='' as $$
declare rev public.post_revisions;item public.posts;patch jsonb;
begin
 select * into rev from public.post_revisions where id=p_revision_id;if not found then raise exception 'NOT_FOUND';end if;
 select * into item from public.posts where id=rev.post_id for update;
 if not private.may_edit(item) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 -- Revisions restore editable content only, never publication state or ownership.
 patch=jsonb_build_object('title',rev.snapshot->'title','slug',rev.snapshot->'slug','subtitle',rev.snapshot->'subtitle','excerpt',rev.snapshot->'excerpt','content',rev.snapshot->'content','content_json',rev.snapshot->'content_json','content_html',rev.snapshot->'content_html','author_id',rev.snapshot->'author_id','primary_category_id',rev.snapshot->'primary_category_id','tags',rev.snapshot->'tags','sources',rev.snapshot->'sources','seo_title',rev.snapshot->'seo_title','seo_description',rev.snapshot->'seo_description','cover_asset_id',rev.snapshot->'cover_asset_id','thumbnail_asset_id',rev.snapshot->'thumbnail_asset_id','share_asset_id',rev.snapshot->'share_asset_id','category_ids',coalesce(rev.snapshot->'category_ids','[]'),'media_ids',coalesce(rev.snapshot->'media_ids','[]'),'editorial_keywords',coalesce(rev.snapshot->'editorial_keywords','[]'),'canonical_url',rev.snapshot->'canonical_url','allow_comments',rev.snapshot->'allow_comments','featured',rev.snapshot->'featured','sharing',coalesce(rev.snapshot->'sharing','{}'));
 return public.cms_save_post(item.id,patch,p_expected_version);
end $$;
