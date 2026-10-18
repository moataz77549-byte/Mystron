
create or replace function private.scope_contains_user(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.admin_memberships caller join public.admin_memberships target on target.user_id=p_user where caller.user_id=auth.uid() and(caller.scope_mode='all' or(target.scope_mode='restricted' and target.category_ids<@caller.category_ids))) $$;
revoke all on function private.scope_contains_user(uuid) from public,anon;grant execute on function private.scope_contains_user(uuid) to authenticated;
drop policy if exists admin_read on public.admin_invitations;
create policy admin_read on public.admin_invitations for select to authenticated using((select private.has_permission('users.invite')) and(created_by=(select auth.uid()) or exists(select 1 from public.admin_memberships caller where caller.user_id=(select auth.uid()) and(caller.scope_mode='all' or(admin_invitations.scope_mode='restricted' and admin_invitations.category_ids<@caller.category_ids)))));
alter table public.ticker_items drop constraint if exists ticker_safe_url;
alter table public.ticker_items add constraint ticker_safe_url check(url is null or private.safe_url(url,true));
create or replace function public.public_comment_options() returns jsonb language sql stable security definer set search_path='' as $$ select jsonb_build_object('enabled',coalesce((c.value->>'enabled')::boolean,true),'replies',coalesce((c.value->>'replies')::boolean,true),'max_depth',coalesce((c.value->>'max_depth')::int,3),'pre_moderation',coalesce((c.value->>'pre_moderation')::boolean,true),'close_days',coalesce((p.value->>'comments_close_days')::int,0)) from (select 1) x left join public.site_settings c on c.key='comments' left join public.site_settings p on p.key='publishing' $$;
revoke all on function public.public_comment_options() from public;grant execute on function public.public_comment_options() to anon,authenticated;
create or replace function public.admin_assignable_roles() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.actor_active(auth.uid()) or(not private.has_permission('users.manage') and not private.has_permission('users.invite')) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 return coalesce((select jsonb_agg(x) from(select id,name from public.roles where private.can_assign_role(auth.uid(),id) order by name) x),'[]'::jsonb);
end $$;
revoke all on function public.admin_assignable_roles() from public,anon;grant execute on function public.admin_assignable_roles() to authenticated;
-- Public comment display policy needs the publication's non-secret close date.
grant select(comments_close_at) on public.posts to anon;
