-- Additive editorial read model. Keep the existing three-argument RPC contract.
-- No owner identity, Auth record, publication status or production data is reset.
create index if not exists posts_editorial_updated_idx on public.posts(updated_at desc,id) where deleted_at is null;
create index if not exists posts_editorial_author_updated_idx on public.posts(author_id,updated_at desc) where deleted_at is null;

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
 if p_page is null or p_q is null or p_status is null or p_filters is null or p_page not between 1 and 10000 or length(p_q)>100 or p_status not in ('','draft','review','scheduled','published','unpublished','archived','trash')
 or v_size not in (25,50,100) or v_sort not in ('updated','created','oldest','title','views','published')
 or jsonb_typeof(p_filters)<>'object' or exists(select 1 from jsonb_object_keys(p_filters) k where k not in ('author_id','category_id','from','to','sort','page_size'))
 or(v_from is not null and v_to is not null and v_from>v_to) then raise exception 'INVALID_QUERY';end if;
 if v_sort='views' and not private.has_permission('analytics.read') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 with visible as materialized (
  select p.* from public.posts p where private.can_post(p,'posts.read')
  and ((p_status='' and p.deleted_at is null) or(p_status='trash' and p.deleted_at is not null) or(p_status not in ('','trash') and p.status=p_status and p.deleted_at is null))
  and (p_q='' or strpos(public.normalize_arabic(p.title),public.normalize_arabic(p_q))>0 or p.search_vector @@ websearch_to_tsquery('simple',public.normalize_arabic(p_q)))
  and(v_author is null or p.author_id=v_author)
  and(v_category is null or exists(select 1 from public.post_categories pc where pc.post_id=p.id and pc.category_id=v_category))
  and(v_from is null or p.updated_at>=v_from::timestamp at time zone 'UTC')
  and(v_to is null or p.updated_at<(v_to+1)::timestamp at time zone 'UTC')
 ), enriched as (
  select p.id,p.title,p.slug,p.status,p.version,p.deleted_at,p.created_at,p.updated_at,p.published_at,p.scheduled_at,
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

create or replace function public.admin_post_list(p_page int default 1,p_q text default '',p_status text default '')
returns jsonb language sql stable security definer set search_path='' as $$
 select private.editorial_post_list(p_page,p_q,p_status,'{"page_size":100}'::jsonb)
$$;
revoke all on function public.admin_post_list(int,text,text) from public,anon;
grant execute on function public.admin_post_list(int,text,text) to authenticated;

create or replace function public.admin_post_list_filtered(p_page int default 1,p_q text default '',p_status text default '',p_filters jsonb default '{}')
returns jsonb language sql stable security definer set search_path='' as $$
 select private.editorial_post_list(p_page,p_q,p_status,p_filters)
$$;
revoke all on function public.admin_post_list_filtered(int,text,text,jsonb) from public,anon;
grant execute on function public.admin_post_list_filtered(int,text,text,jsonb) to authenticated;
