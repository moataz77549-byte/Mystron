-- Merge read policies; keep all mutations confined to explicitly authorized RPCs.
drop policy if exists staff_read on public.media_assets;
drop policy if exists media_owner_read on public.media_assets;
create policy media_owner_read on public.media_assets for select to authenticated using((select private.has_role(array['OWNER','ADMIN','EDITOR'])) or (owner_id=(select auth.uid()) and deleted_at is null and (select private.has_role(array['AUTHOR']))));
drop policy if exists staff_read on public.post_revisions;
drop policy if exists own_revisions on public.post_revisions;
create policy own_revisions on public.post_revisions for select to authenticated using((select private.has_role(array['OWNER','ADMIN','EDITOR'])) or exists(select 1 from public.posts p where p.id=post_id and p.created_by=(select auth.uid()) and (select private.has_role(array['AUTHOR']))));
-- Anonymous access to publication aggregates only; raw visitor hashes stay private.
grant select on public.post_view_daily to anon;
drop policy if exists public_counts on public.post_view_daily;
create policy public_counts on public.post_view_daily for select to anon using(exists(select 1 from public.posts p where p.id=post_id));
drop policy if exists staff_read on public.post_view_daily;
create policy staff_read on public.post_view_daily for select to authenticated using((select private.has_role(array['OWNER','ADMIN','EDITOR'])) or exists(select 1 from public.posts p where p.id=post_id and p.status='published' and p.visibility='public' and p.deleted_at is null and p.published_at<=now()));
alter function public.public_view_stats(int,int) security invoker;
alter function public.post_view_count(uuid) security invoker;
notify pgrst,'reload schema';
