-- Keep existing publication statuses and the single transition engine.
alter table public.posts add column if not exists approved_version bigint;
alter table public.posts add column if not exists approved_at timestamptz;
alter table public.posts add column if not exists approved_by uuid references auth.users(id) on delete set null;
alter table public.posts add constraint post_approval_version_valid check(approved_version is null or approved_version<=version);

create or replace function public.cms_transition_post(p_id uuid,p_action text,p_expected_version bigint,p_scheduled_at timestamptz default null) returns public.posts language plpgsql security definer set search_path='' as $$
declare item public.posts;new_id uuid;actor uuid=auth.uid();publisher boolean;permission text;rev public.post_revisions;
begin
 if not private.actor_active(auth.uid()) then raise exception 'FORBIDDEN';end if;permission=case when p_action in ('approve','publish','unpublished','archived') then 'posts.publish' when p_action='scheduled' then 'posts.schedule' when p_action in ('delete','restore') then 'posts.delete' when p_action='duplicate' then 'posts.create' else 'posts.update' end;perform private.require_permission(permission);
 publisher=private.has_permission('posts.publish');
 select * into item from public.posts where id=p_id for update;if not found then raise exception 'NOT_FOUND';end if;
 if item.version<>p_expected_version then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;
 if (item.status='published' and p_action<>'duplicate' and not private.has_permission('posts.publish')) or not private.can_post(item,permission) or (p_action='duplicate' and not private.can_post(item,'posts.read')) or (p_action='scheduled' and not private.can_post(item,'posts.publish')) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if item.deleted_at is not null and p_action<>'restore' then raise exception 'POST_DELETED';end if;
 -- Approval is a decision on this exact content version, never a new status.
 if p_action='approve' then
 if item.status<>'review' then raise exception 'APPROVAL_REQUIRES_REVIEW';end if;
 if item.approved_version=item.version then return item;end if;
 update public.posts set approved_version=version,approved_at=now(),approved_by=actor where id=p_id returning * into item;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(actor,'post_approved','post',item.id::text,jsonb_build_object('version',item.version));
 return item;
 end if;
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

create or replace function private.editorial_post_list(p_page int,p_q text,p_status text,p_filters jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 v_size int=coalesce((p_filters->>'page_size')::int,25);
 v_sort text=coalesce(p_filters->>'sort','updated');
 v_author uuid=nullif(p_filters->>'author_id','')::uuid;
 v_category uuid=nullif(p_filters->>'category_id','')::uuid;
 v_from date=nullif(p_filters->>'from','')::date;
 v_to date=nullif(p_filters->>'to','')::date;
 result jsonb;
begin
 if not private.has_permission('posts.read') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_page is null or p_q is null or p_status is null or p_filters is null or p_page not between 1 and 10000 or length(p_q)>100 or p_status not in ('','draft','review','approved','scheduled','published','unpublished','archived','trash')
 or v_size not in (25,50,100) or v_sort not in ('updated','created','oldest','title','views','published')
 or jsonb_typeof(p_filters)<>'object' or exists(select 1 from jsonb_object_keys(p_filters) k where k not in ('author_id','category_id','from','to','sort','page_size'))
 or(v_from is not null and v_to is not null and v_from>v_to) then raise exception 'INVALID_QUERY';end if;
 if v_sort='views' and not private.has_permission('analytics.read') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 with visible as materialized (
  select p.* from public.posts p where private.can_post(p,'posts.read')
  and ((p_status='' and p.deleted_at is null) or(p_status='trash' and p.deleted_at is not null) or(p_status not in ('','trash','approved') and p.status=p_status and p.deleted_at is null) or(p_status='approved' and p.status='review' and p.approved_version=p.version and p.deleted_at is null))
  and (p_q='' or strpos(public.normalize_arabic(p.title),public.normalize_arabic(p_q))>0 or p.search_vector @@ websearch_to_tsquery('simple',public.normalize_arabic(p_q)))
  and(v_author is null or p.author_id=v_author)
  and(v_category is null or exists(select 1 from public.post_categories pc where pc.post_id=p.id and pc.category_id=v_category))
  and(v_from is null or p.updated_at>=v_from::timestamp at time zone 'UTC')
  and(v_to is null or p.updated_at<(v_to+1)::timestamp at time zone 'UTC')
 ), enriched as (
  select p.id,p.title,p.slug,p.status,p.version,p.approved_version,p.deleted_at,p.created_at,p.updated_at,p.published_at,p.scheduled_at,
   p.author_id,p.primary_category_id,coalesce(p.thumbnail_asset_id,p.cover_asset_id) thumbnail_asset_id,
   (select a.display_name from public.authors a where a.id=p.author_id) author_name,
   (select c.name from public.categories c where c.id=p.primary_category_id) category_name,
   case when private.can_post(p,'analytics.read') then(select coalesce(sum(v.views),0) from public.post_view_daily v where v.post_id=p.id) else null end views,
   private.can_post(p,'posts.update') and(p.status<>'published' or private.has_permission('posts.publish')) can_update,
   private.can_post(p,'posts.delete') and(p.status<>'published' or private.has_permission('posts.publish')) can_delete,
   private.can_post(p,'posts.publish') can_publish,
   private.can_post(p,'posts.schedule') can_schedule,
   private.has_permission('posts.create') can_duplicate
  from visible p
 ), ordered as (
  select * from enriched order by
   case when v_sort='oldest' then updated_at end asc,
   case when v_sort='title' then title end asc,
   case when v_sort='views' then views end desc nulls last,
   case when v_sort='created' then created_at end desc,
   case when v_sort='published' then published_at end desc nulls last,
   updated_at desc,id limit v_size offset(p_page-1)*v_size
 )
 select jsonb_build_object('rows',coalesce((select jsonb_agg(x) from ordered x),'[]'::jsonb),'total',(select count(*) from visible),'page',p_page,'page_size',v_size) into result;
 return result;
end $$;
revoke all on function private.editorial_post_list(int,text,text,jsonb) from public,anon,authenticated;

