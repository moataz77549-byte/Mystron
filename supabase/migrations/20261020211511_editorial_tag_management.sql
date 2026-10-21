-- Reuse posts.tags and cms_save_post: one revision, audit and index path.
create or replace function public.admin_tag_list(p_page int default 1,p_q text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_permission('posts.read');
 if p_page is null or p_page not between 1 and 10000 or p_q is null or length(p_q)>80 then raise exception 'INVALID_INPUT';end if;
 with visible as materialized (
  select tag,count(distinct p.id) posts,
   count(distinct p.id) filter(where private.can_post(p,'posts.update') and (p.status<>'published' or private.has_permission('posts.publish'))) editable_posts
  from public.posts p cross join lateral unnest(p.tags) tag
  where p.deleted_at is null and private.can_post(p,'posts.read') and btrim(tag)<>''
  and (p_q='' or strpos(public.normalize_arabic(tag),public.normalize_arabic(p_q))>0)
  group by tag
 ), items as(select * from visible order by posts desc,tag limit 50 offset (p_page-1)*50)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(i) from items i),'[]'::jsonb),
  'total',(select count(*) from visible),'page',p_page,'page_size',50) into result;
 return result;
end $$;
revoke all on function public.admin_tag_list(int,text) from public,anon;
grant execute on function public.admin_tag_list(int,text) to authenticated;

create or replace function public.cms_merge_tag(p_source text,p_target text,p_expected_count int)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.posts;ids uuid[];changed int=0;next_tags text[];
begin
 perform private.require_permission('posts.read');
 perform private.require_permission('posts.update');
 if p_source is null or p_target is null or btrim(p_source)='' or btrim(p_target)='' or p_target<>btrim(p_target)
 or length(p_source)>80 or length(p_target)>80 or p_source=p_target or p_expected_count is null or p_expected_count not between 0 and 500 then raise exception 'INVALID_INPUT';end if;
 -- Lock in a stable order. Scope and publication authorization match the editor.
 select array_agg(x.id) into ids from (
  select p.id from public.posts p where p.deleted_at is null and p_source=any(p.tags)
  and private.can_post(p,'posts.read') and private.can_post(p,'posts.update')
  and(p.status<>'published' or private.has_permission('posts.publish'))
  order by p.id for update
 ) x;
 if coalesce(cardinality(ids),0)>500 then raise exception 'TAG_BATCH_TOO_LARGE';end if;
 -- An already-applied operation is a safe no-op.
 if coalesce(cardinality(ids),0)=0 then return jsonb_build_object('updated',0);end if;
 if cardinality(ids)<>p_expected_count then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;
 for item in select * from public.posts where id=any(ids) order by id loop
  select array_agg(t.tag order by t.first_pos) into next_tags from (
   select case when tag=p_source then p_target else tag end tag,min(pos) first_pos
   from unnest(item.tags) with ordinality as tags(tag,pos)
   group by case when tag=p_source then p_target else tag end
  ) t;
  perform public.cms_save_post(item.id,jsonb_build_object('tags',to_jsonb(next_tags)),item.version);
  changed=changed+1;
 end loop;
 return jsonb_build_object('updated',changed);
end $$;
revoke all on function public.cms_merge_tag(text,text,int) from public,anon;
grant execute on function public.cms_merge_tag(text,text,int) to authenticated;
