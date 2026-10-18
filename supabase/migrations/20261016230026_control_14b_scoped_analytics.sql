-- Scoped aggregates never transfer raw visitor identifiers to an administrator.
create or replace function public.admin_dashboard() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;today date=(now() at time zone 'Asia/Aden')::date;
begin
 if not private.has_permission('dashboard.read') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select jsonb_build_object('posts',count(*),'published',count(*) filter(where status='published'),'draft',count(*) filter(where status='draft'),'review',count(*) filter(where status='review'),'scheduled',count(*) filter(where status='scheduled')) into result from public.posts p where p.deleted_at is null and private.can_post(p,'posts.read');
 if private.has_permission('analytics.read') then
 result=result||jsonb_build_object('views',(select coalesce(sum(v.views),0) from public.post_view_daily v join public.posts p on p.id=v.post_id where private.can_post(p,'analytics.read')),'today_views',(select coalesce(sum(v.views),0) from public.post_view_daily v join public.posts p on p.id=v.post_id where v.day>=current_date and private.can_post(p,'analytics.read')),'week_views',(select coalesce(sum(v.views),0) from public.post_view_daily v join public.posts p on p.id=v.post_id where v.day>=current_date-6 and private.can_post(p,'analytics.read')),'month_views',(select coalesce(sum(v.views),0) from public.post_view_daily v join public.posts p on p.id=v.post_id where v.day>=date_trunc('month',now())::date and private.can_post(p,'analytics.read')));end if;
 if private.has_permission('comments.moderate') then result=result||jsonb_build_object('pending_comments',(select count(*) from public.comments c join public.posts p on p.id=c.post_id where c.status='pending' and c.deleted_at is null and private.can_post(p,'comments.moderate')));end if;
 if private.has_permission('authors.manage') then result=result||jsonb_build_object('authors',(select count(*) from public.authors where deleted_at is null));end if;
 if private.has_permission('users.manage') then result=result||jsonb_build_object('admins',(select count(*) from public.admin_memberships where enabled and private.scope_contains_user(user_id)));end if;
 return result;
end $$;
create or replace function public.admin_analytics(p_from date,p_to date,p_page int default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_permission('analytics.read') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>365 or p_page not between 1 and 10000 then raise exception 'INVALID_PERIOD';end if;
 return jsonb_build_object(
 'days',coalesce((select jsonb_agg(x) from(select v.day,sum(v.views) views from public.post_view_daily v join public.posts p on p.id=v.post_id where v.day between p_from and p_to and private.can_post(p,'analytics.read') group by v.day order by v.day) x),'[]'::jsonb),
 'posts',coalesce((select jsonb_agg(x) from(select p.id,p.title,p.status,p.published_at,(select coalesce(sum(v.views),0) from public.post_view_daily v where v.post_id=p.id and v.day between p_from and p_to) views,(select count(*) from public.comments c where c.post_id=p.id and c.deleted_at is null) comments from public.posts p where p.deleted_at is null and private.can_post(p,'analytics.read') order by views desc,p.id limit 25 offset(p_page-1)*25) x),'[]'::jsonb),
 'total',(select count(*) from public.posts p where p.deleted_at is null and private.can_post(p,'analytics.read')),
 'categories',coalesce((select jsonb_agg(x) from(select c.id,c.name,coalesce(sum(v.views),0) views from public.categories c join public.post_categories pc on pc.category_id=c.id join public.posts p on p.id=pc.post_id left join public.post_view_daily v on v.post_id=p.id and v.day between p_from and p_to where private.can_post(p,'analytics.read') group by c.id,c.name order by views desc,c.id limit 25) x),'[]'::jsonb),
 'authors',coalesce((select jsonb_agg(x) from(select a.id,a.display_name,count(distinct p.id) posts,count(distinct p.id) filter(where p.status='published') published,count(distinct p.id) filter(where p.status='draft') drafts,count(distinct p.id) filter(where p.status='scheduled') scheduled,coalesce(sum(v.views),0) views from public.authors a join public.posts p on p.author_id=a.id left join public.post_view_daily v on v.post_id=p.id and v.day between p_from and p_to where private.can_post(p,'analytics.read') group by a.id,a.display_name order by views desc,a.id limit 25) x),'[]'::jsonb)
 );
end $$;
revoke all on function public.admin_dashboard(),public.admin_analytics(date,date,int) from public,anon;
grant execute on function public.admin_dashboard(),public.admin_analytics(date,date,int) to authenticated;
