-- Explicit category transfer operation; version/revision changes are atomic.
create or replace function public.cms_move_category_posts(p_from uuid,p_to uuid) returns integer language plpgsql security definer set search_path='' as $$
declare item public.posts;moved int=0;
begin
 if not private.has_role(array['OWNER','ADMIN','EDITOR']) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_from=p_to or not exists(select 1 from public.categories where id=p_from and deleted_at is null) or not exists(select 1 from public.categories where id=p_to and is_active and deleted_at is null) then raise exception 'INVALID_CATEGORY';end if;
 for item in select p.* from public.posts p where exists(select 1 from public.post_categories pc where pc.post_id=p.id and pc.category_id=p_from) and (p.primary_category_id=p_from or not exists(select 1 from public.post_categories target where target.post_id=p.id and target.category_id=p_to)) order by p.id for update loop
 insert into public.post_revisions(post_id,editor_id,snapshot) values(item.id,auth.uid(),private.post_snapshot(item));
 insert into public.post_categories(post_id,category_id) values(item.id,p_to) on conflict do nothing;
 -- Preserve the previous association as a secondary category; this operation is non-destructive.
 update public.posts set primary_category_id=case when primary_category_id=p_from then p_to else primary_category_id end,version=version+1 where id=item.id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'post_category_transferred','post',item.id::text);moved=moved+1;
 end loop;return moved;
end $$;
revoke all on function public.cms_move_category_posts(uuid,uuid) from public,anon;
grant execute on function public.cms_move_category_posts(uuid,uuid) to authenticated;
-- Share visibility preferences are publication data, never administration identities.
grant select(sharing) on public.posts to anon;
notify pgrst,'reload schema';
