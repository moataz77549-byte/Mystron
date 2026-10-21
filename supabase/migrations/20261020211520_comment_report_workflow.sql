alter table public.comment_reports add column if not exists resolved_at timestamptz;
alter table public.comment_reports add column if not exists resolved_by uuid references auth.users(id) on delete set null;
alter table public.comment_reports add column if not exists resolution text check(resolution in ('dismissed','hidden','rejected'));
create index if not exists comment_reports_pending_created_idx on public.comment_reports(created_at desc,id) where resolved_at is null;

create or replace function public.admin_report_list(p_page int default 1,p_status text default 'pending')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_permission('comments.moderate');
 if p_page is null or p_page not between 1 and 10000 or p_status is null or p_status not in ('pending','resolved','all') then raise exception 'INVALID_INPUT';end if;
 with visible as materialized (
  select r.id,r.comment_id,r.reason,r.created_at,r.resolved_at,r.resolution,
   c.body,c.guest_name,c.status comment_status,p.id post_id,p.title post_title
  from public.comment_reports r join public.comments c on c.id=r.comment_id join public.posts p on p.id=c.post_id
  where private.can_post(p,'comments.moderate')
  and(p_status='all' or(p_status='pending' and r.resolved_at is null) or(p_status='resolved' and r.resolved_at is not null))
 ), items as(select * from visible order by created_at desc,id limit 25 offset(p_page-1)*25)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(i) from items i),'[]'::jsonb),'total',(select count(*) from visible),'page',p_page,'page_size',25) into result;
 return result;
end $$;
revoke all on function public.admin_report_list(int,text) from public,anon;
grant execute on function public.admin_report_list(int,text) to authenticated;

create or replace function public.cms_resolve_report(p_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare report public.comment_reports;item public.posts;
begin
 perform private.require_permission('comments.moderate');
 if p_action is null or p_action not in ('dismissed','hidden','rejected') then raise exception 'INVALID_INPUT';end if;
 select * into report from public.comment_reports where id=p_id for update;
 if not found then raise exception 'NOT_FOUND';end if;
 select p.* into item from public.posts p join public.comments c on c.post_id=p.id where c.id=report.comment_id;
 if not found or not private.can_post(item,'comments.moderate') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if report.resolved_at is not null then return jsonb_build_object('resolved',true,'resolution',report.resolution);end if;
 if p_action in ('hidden','rejected') then perform public.cms_moderate_comment(report.comment_id,p_action);end if;
 update public.comment_reports set resolved_at=now(),resolved_by=auth.uid(),resolution=p_action where id=p_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'comment_report_'||p_action,'comment_report',p_id::text);
 return jsonb_build_object('resolved',true,'resolution',p_action);
end $$;
revoke all on function public.cms_resolve_report(uuid,text) from public,anon;
grant execute on function public.cms_resolve_report(uuid,text) to authenticated;

-- Admin lists must apply editorial scope explicitly, including public comments.
create or replace function public.admin_comment_list(p_page int default 1,p_status text default 'pending')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_permission('comments.moderate');
 if p_page is null or p_page not between 1 and 10000 or p_status is null or p_status not in ('pending','approved','rejected','hidden','all') then raise exception 'INVALID_INPUT';end if;
 with visible as materialized (
  select c.id,c.guest_name,c.body,c.status,c.post_id,c.deleted_at,c.created_at
  from public.comments c join public.posts p on p.id=c.post_id
  where c.deleted_at is null and private.can_post(p,'comments.moderate')
  and(p_status='all' or c.status=p_status)
 ), items as(select * from visible order by created_at desc,id limit 25 offset(p_page-1)*25)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(i) from items i),'[]'::jsonb),'total',(select count(*) from visible),'page',p_page,'page_size',25) into result;
 return result;
end $$;
revoke all on function public.admin_comment_list(int,text) from public,anon;
grant execute on function public.admin_comment_list(int,text) to authenticated;
