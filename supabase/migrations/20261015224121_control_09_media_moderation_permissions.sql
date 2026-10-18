
create or replace function public.cms_save_category(p_id uuid,p_patch jsonb,p_transfer_to uuid default null) returns public.categories language plpgsql security definer set search_path='' as $$
declare item public.categories;previous_slug text;parent uuid;action text=coalesce(p_patch->>'action','save');k text;
begin
 perform private.require_permission('categories.manage');if exists(select 1 from public.admin_memberships where user_id=auth.uid() and scope_mode='restricted' and (p_id is null or not p_id=any(category_ids))) then raise exception 'CATEGORY_OUT_OF_SCOPE';end if;
 for k in select jsonb_object_keys(p_patch) loop if not k=any(array['name','slug','description','sort_order','is_active','parent_id','image_asset_id','icon','action']) then raise exception 'UNKNOWN_FIELD';end if;end loop;
 if p_id is null then insert into public.categories(name,slug) values(p_patch->>'name',p_patch->>'slug') returning * into item;
 else select * into item from public.categories where id=p_id for update;if not found then raise exception 'NOT_FOUND';end if;end if;
 previous_slug=item.slug;
 parent=case when p_patch?'parent_id' then nullif(p_patch->>'parent_id','')::uuid else item.parent_id end;
 if parent=item.id or exists(with recursive ancestors as(select id,parent_id from public.categories where id=parent union all select c.id,c.parent_id from public.categories c join ancestors a on c.id=a.parent_id) select 1 from ancestors where id=item.id) then raise exception 'CATEGORY_CYCLE';end if;
 if action='delete' then
 if exists(select 1 from public.post_categories where category_id=item.id) or exists(select 1 from public.categories where parent_id=item.id and deleted_at is null) then
 if p_transfer_to is null or p_transfer_to=item.id or not exists(select 1 from public.categories where id=p_transfer_to and is_active and deleted_at is null) then raise exception 'CATEGORY_IN_USE';end if;
 if exists(with recursive descendants as(select id from public.categories where parent_id=item.id union all select c.id from public.categories c join descendants d on c.parent_id=d.id) select 1 from descendants where id=p_transfer_to) then raise exception 'CATEGORY_CYCLE';end if;
 insert into public.post_categories select post_id,p_transfer_to from public.post_categories where category_id=item.id on conflict do nothing;
 delete from public.post_categories where category_id=item.id;
 update public.posts set primary_category_id=p_transfer_to,version=version+1 where primary_category_id=item.id;
 update public.categories set parent_id=p_transfer_to where parent_id=item.id;
 end if;
 update public.categories set deleted_at=now(),is_active=false where id=item.id returning * into item;
 elsif action='restore' then update public.categories set deleted_at=null,is_active=true where id=item.id returning * into item;
 elsif action='save' then
 update public.categories set name=coalesce(p_patch->>'name',name),slug=coalesce(p_patch->>'slug',slug),description=case when p_patch?'description' then p_patch->>'description' else description end,sort_order=coalesce((p_patch->>'sort_order')::int,sort_order),is_active=coalesce((p_patch->>'is_active')::boolean,is_active),parent_id=parent,image_asset_id=case when p_patch?'image_asset_id' then nullif(p_patch->>'image_asset_id','')::uuid else image_asset_id end,icon=case when p_patch?'icon' then p_patch->>'icon' else icon end where id=item.id returning * into item;
 else raise exception 'INVALID_ACTION';end if;
 if previous_slug<>item.slug then
 if exists(select 1 from public.slug_redirects where kind='category' and old_slug=item.slug) then raise exception 'SLUG_RESERVED';end if;
 update public.slug_redirects set new_slug=item.slug where kind='category' and new_slug=previous_slug;
 insert into public.slug_redirects(kind,old_slug,new_slug) values('category',previous_slug,item.slug) on conflict(kind,old_slug) do update set new_slug=excluded.new_slug;
 end if;
 if item.image_asset_id is not null then if not exists(select 1 from public.media_assets where id=item.image_asset_id and deleted_at is null and(owner_id=auth.uid() or private.permission_scope_for(auth.uid(),'media.manage')='all')) then raise exception 'INVALID_MEDIA';end if;update public.media_assets set visibility='public' where id=item.image_asset_id;end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'category_'||action,'category',item.id::text);return item;
end $$;
create or replace function public.cms_save_author(p_id uuid,p_patch jsonb) returns public.authors language plpgsql security definer set search_path='' as $$
declare item public.authors;previous_slug text;k text;
begin
 perform private.require_permission('authors.manage');
 for k in select jsonb_object_keys(p_patch) loop if not k=any(array['display_name','short_name','slug','bio','country','city','website','links','is_active','sort_order','avatar_asset_id','action']) then raise exception 'UNKNOWN_FIELD';end if;end loop;
 if p_id is null then insert into public.authors(display_name,slug) values(p_patch->>'display_name',p_patch->>'slug') returning * into item;
 else select * into item from public.authors where id=p_id for update;if not found then raise exception 'NOT_FOUND';end if;end if;
 previous_slug=item.slug;
 if p_patch->>'action'='delete' then
 if exists(select 1 from public.posts where author_id=item.id and deleted_at is null) then raise exception 'AUTHOR_IN_USE';end if;
 update public.authors set deleted_at=now(),is_active=false where id=item.id returning * into item;
 else
 update public.authors set display_name=coalesce(p_patch->>'display_name',display_name),short_name=case when p_patch?'short_name' then p_patch->>'short_name' else short_name end,slug=coalesce(p_patch->>'slug',slug),bio=case when p_patch?'bio' then p_patch->>'bio' else bio end,country=case when p_patch?'country' then p_patch->>'country' else country end,city=case when p_patch?'city' then p_patch->>'city' else city end,website=case when p_patch?'website' then p_patch->>'website' else website end,links=coalesce(p_patch->'links',links),is_active=coalesce((p_patch->>'is_active')::boolean,is_active),sort_order=coalesce((p_patch->>'sort_order')::int,sort_order),avatar_asset_id=case when p_patch?'avatar_asset_id' then nullif(p_patch->>'avatar_asset_id','')::uuid else avatar_asset_id end,deleted_at=case when p_patch->>'action'='restore' then null else deleted_at end where id=item.id returning * into item;
 end if;
 if previous_slug<>item.slug then
 if exists(select 1 from public.slug_redirects where kind='author' and old_slug=item.slug) then raise exception 'SLUG_RESERVED';end if;
 update public.slug_redirects set new_slug=item.slug where kind='author' and new_slug=previous_slug;
 insert into public.slug_redirects(kind,old_slug,new_slug) values('author',previous_slug,item.slug) on conflict(kind,old_slug) do update set new_slug=excluded.new_slug;
 end if;
 if item.avatar_asset_id is not null then if not exists(select 1 from public.media_assets where id=item.avatar_asset_id and deleted_at is null) then raise exception 'INVALID_MEDIA';end if;update public.media_assets set visibility='public' where id=item.avatar_asset_id;end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'author_saved','author',item.id::text);return item;
end $$;
create or replace function public.cms_register_media(p_asset jsonb) returns public.media_assets language plpgsql security definer set search_path='' as $$
declare item public.media_assets;k text;
begin
 perform private.require_permission('media.manage');
 for k in select jsonb_object_keys(p_asset) loop if not k=any(array['id','path','mime_type','size_bytes','display_name','alt_text','caption','folder','width','height','animated','variants','checksum']) then raise exception 'UNKNOWN_FIELD';end if;end loop;
 if not (p_asset->>'path' like auth.uid()::text||'/'||(p_asset->>'id')||'/%') or p_asset->>'path' like '%..%' then raise exception 'INVALID_PATH';end if;if exists(select 1 from jsonb_each_text(coalesce(p_asset->'variants','{}')) v where v.key not in ('optimized','thumbnail','social') or v.value not like auth.uid()::text||'/'||(p_asset->>'id')||'/%' or v.value like '%..%') then raise exception 'INVALID_PATH';end if;
 if coalesce((p_asset->>'width')::int,0) not between 1 and 20000 or coalesce((p_asset->>'height')::int,0) not between 1 and 20000 then raise exception 'INVALID_DIMENSIONS';end if;
 insert into public.media_assets(id,owner_id,path,mime_type,size_bytes,display_name,alt_text,caption,folder,width,height,animated,variants,checksum)
 values((p_asset->>'id')::uuid,auth.uid(),p_asset->>'path',p_asset->>'mime_type',(p_asset->>'size_bytes')::bigint,coalesce(p_asset->>'display_name',''),p_asset->>'alt_text',p_asset->>'caption',coalesce(p_asset->>'folder',''),(p_asset->>'width')::int,(p_asset->>'height')::int,coalesce((p_asset->>'animated')::boolean,false),coalesce(p_asset->'variants','{}'),p_asset->>'checksum') returning * into item;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'media_uploaded','media',item.id::text);return item;
end $$;
