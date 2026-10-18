create or replace function public.admin_period_metrics(p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare current_views numeric;previous_views numeric;post_count bigint;review_hours numeric;days int;
begin
 if not private.has_permission('analytics.read') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>365 then raise exception 'INVALID_PERIOD';end if;days=p_to-p_from+1;
 select coalesce(sum(v.views) filter(where v.day between p_from and p_to),0),coalesce(sum(v.views) filter(where v.day between p_from-days and p_from-1),0) into current_views,previous_views from public.post_view_daily v join public.posts p on p.id=v.post_id where v.day between p_from-days and p_to and p.deleted_at is null and private.can_post(p,'analytics.read');
 select count(*) into post_count from public.posts p where p.deleted_at is null and private.can_post(p,'analytics.read');
 -- Each published event is paired with its latest preceding review in the retained audit history.
 select avg(extract(epoch from(a.created_at-r.started_at))/3600.0) into review_hours from public.audit_logs a join public.posts p on p.id::text=a.entity_id cross join lateral(select max(created_at) started_at from public.audit_logs where entity_type='post' and entity_id=a.entity_id and action='post_review' and created_at<a.created_at) r where a.action in ('post_publish','post_published_scheduled') and a.created_at>=p_from::timestamptz and a.created_at<(p_to+1)::timestamptz and r.started_at is not null and private.can_post(p,'analytics.read');
 return jsonb_build_object('current_views',current_views,'previous_views',previous_views,'previous_from',p_from-days,'previous_to',p_from-1,'change_percent',case when previous_views>0 then round((current_views-previous_views)*100/previous_views,2) end,'average_views_per_post',case when post_count>0 then round(current_views/post_count,2) end,'average_review_hours',round(review_hours,2),'review_measurement','paired review/publish events retained in audit history');
end $$;
revoke all on function public.admin_period_metrics(date,date) from public,anon;grant execute on function public.admin_period_metrics(date,date) to authenticated;
create index if not exists audit_post_review_idx on public.audit_logs(entity_type,entity_id,created_at) where action in ('post_review','post_publish','post_published_scheduled');
