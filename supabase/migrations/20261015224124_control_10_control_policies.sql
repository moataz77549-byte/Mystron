
create or replace function public.cms_update_media(p_id uuid,p_patch jsonb) returns public.media_assets language plpgsql security definer set search_path='' as $$
declare item public.media_assets;k text;
begin
 select * into item from public.media_assets where id=p_id for update;if not found then raise exception 'NOT_FOUND';end if;
 perform private.require_permission('media.manage');if item.owner_id<>auth.uid() and private.permission_scope_for(auth.uid(),'media.manage')<>'all' then raise exception 'FORBIDDEN';end if;
 for k in select jsonb_object_keys(p_patch) loop if not k=any(array['display_name','alt_text','caption','folder','action']) then raise exception 'UNKNOWN_FIELD';end if;end loop;
 if p_patch->>'action'='delete' then
 if exists(select 1 from public.post_media where asset_id=p_id) or exists(select 1 from public.posts where cover_asset_id=p_id or thumbnail_asset_id=p_id or share_asset_id=p_id) or exists(select 1 from public.authors where avatar_asset_id=p_id) or exists(select 1 from public.categories where image_asset_id=p_id) or exists(select 1 from public.ticker_items where image_asset_id=p_id) or exists(select 1 from public.site_settings where key='identity' and p_id::text in(value->>'logo_asset_id',value->>'favicon_asset_id',value->>'og_asset_id')) then raise exception 'MEDIA_IN_USE';end if;
 update public.media_assets set deleted_at=now() where id=p_id returning * into item;
 else
 update public.media_assets set display_name=coalesce(p_patch->>'display_name',display_name),alt_text=case when p_patch?'alt_text' then p_patch->>'alt_text' else alt_text end,caption=case when p_patch?'caption' then p_patch->>'caption' else caption end,folder=coalesce(p_patch->>'folder',folder),updated_at=now() where id=p_id returning * into item;
 end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'media_updated','media',item.id::text);return item;
end $$;
create or replace function public.cms_moderate_comment(p_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_permission('comments.moderate');if not exists(select 1 from public.comments c join public.posts p on p.id=c.post_id where c.id=p_id and private.can_post(p,'comments.moderate')) then raise exception 'FORBIDDEN';end if;
 if p_action='delete' then update public.comments set deleted_at=now(),status='hidden',updated_at=now() where id=p_id;
 elsif p_action in ('approved','rejected','hidden','pending') then update public.comments set status=p_action,updated_at=now() where id=p_id;
 else raise exception 'INVALID_ACTION';end if;
 if not found then raise exception 'NOT_FOUND';end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'comment_'||p_action,'comment',p_id::text);
end $$;
create or replace function public.cms_save_ticker(p_id uuid,p_patch jsonb) returns public.ticker_items language plpgsql security definer set search_path='' as $$
declare item public.ticker_items;k text;
begin
 perform private.require_permission('announcements.manage');
 for k in select jsonb_object_keys(p_patch) loop if not k=any(array['text','url','is_active','sort_order','starts_at','ends_at','image_asset_id','style','pages','placement','sponsored','action']) then raise exception 'UNKNOWN_FIELD';end if;end loop;
 if p_patch->>'action'='delete' then delete from public.ticker_items where id=p_id returning * into item;return item;end if;
 if p_id is null then insert into public.ticker_items(text) values(p_patch->>'text') returning * into item;else select * into item from public.ticker_items where id=p_id for update;if not found then raise exception 'NOT_FOUND';end if;end if;
 update public.ticker_items set text=coalesce(p_patch->>'text',text),url=case when p_patch?'url' then nullif(p_patch->>'url','') else url end,is_active=coalesce((p_patch->>'is_active')::boolean,is_active),sort_order=coalesce((p_patch->>'sort_order')::int,sort_order),starts_at=coalesce((p_patch->>'starts_at')::timestamptz,starts_at),ends_at=case when p_patch?'ends_at' then nullif(p_patch->>'ends_at','')::timestamptz else ends_at end,image_asset_id=case when p_patch?'image_asset_id' then nullif(p_patch->>'image_asset_id','')::uuid else image_asset_id end,style=coalesce(p_patch->>'style',style),pages=case when p_patch?'pages' then array(select jsonb_array_elements_text(p_patch->'pages')) else pages end,placement=coalesce(p_patch->>'placement',placement),sponsored=coalesce((p_patch->>'sponsored')::boolean,sponsored) where id=item.id returning * into item;
 if item.image_asset_id is not null then if not exists(select 1 from public.media_assets where id=item.image_asset_id and deleted_at is null and(owner_id=auth.uid() or private.permission_scope_for(auth.uid(),'media.manage')='all')) then raise exception 'INVALID_MEDIA';end if;update public.media_assets set visibility='public' where id=item.image_asset_id;end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'ticker_saved','ticker',item.id::text);return item;
end $$;
create or replace function public.cms_publishing_settings(p_value jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_permission('settings.update');
 if jsonb_typeof(p_value)<>'object' or exists(select 1 from jsonb_object_keys(p_value) k where k not in ('default_comments','comments_close_days','timezone','default_visibility','view_retention_days')) then raise exception 'INVALID_INPUT';end if;
 insert into public.site_settings(key,value,is_public) values('publishing',p_value,false) on conflict(key) do update set value=excluded.value,updated_at=now();
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'publishing_settings_saved','settings','publishing');
end $$;
create or replace function public.cms_bulk_transition(p_items jsonb,p_action text) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;result public.posts;results jsonb='[]';
begin
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 or p_action not in ('review','archived','unpublished','delete','restore') then raise exception 'INVALID_INPUT';end if;
 for item in select value from jsonb_array_elements(p_items) loop result=public.cms_transition_post((item->>'id')::uuid,p_action,(item->>'version')::bigint);results=results||jsonb_build_array(jsonb_build_object('id',result.id,'version',result.version,'status',result.status));end loop;return results;
end $$;
create or replace function public.cms_move_category_posts(p_from uuid,p_to uuid) returns integer language plpgsql security definer set search_path='' as $$
declare item public.posts;moved int=0;
begin
 perform private.require_permission('categories.manage');if exists(select 1 from public.admin_memberships where user_id=auth.uid() and scope_mode='restricted' and (not p_from=any(category_ids) or not p_to=any(category_ids))) then raise exception 'CATEGORY_OUT_OF_SCOPE';end if;
 if p_from=p_to or not exists(select 1 from public.categories where id=p_from and deleted_at is null) or not exists(select 1 from public.categories where id=p_to and is_active and deleted_at is null) then raise exception 'INVALID_CATEGORY';end if;
 for item in select p.* from public.posts p where exists(select 1 from public.post_categories pc where pc.post_id=p.id and pc.category_id=p_from) and (p.primary_category_id=p_from or not exists(select 1 from public.post_categories target where target.post_id=p.id and target.category_id=p_to)) order by p.id for update loop
 insert into public.post_revisions(post_id,editor_id,snapshot) values(item.id,auth.uid(),private.post_snapshot(item));
 insert into public.post_categories(post_id,category_id) values(item.id,p_to) on conflict do nothing;
 -- Preserve the previous association as a secondary category; this operation is non-destructive.
 update public.posts set primary_category_id=case when primary_category_id=p_from then p_to else primary_category_id end,version=version+1 where id=item.id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'post_category_transferred','post',item.id::text);moved=moved+1;
 end loop;return moved;
end $$;
