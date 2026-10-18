

-- Replace existing CMS authorization rather than adding a parallel publishing service.
create or replace function public.cms_save_post(p_id uuid,p_patch jsonb,p_expected_version bigint default null) returns public.posts language plpgsql security definer set search_path='' as $$
declare item public.posts;previous_slug text;cat uuid;asset uuid;k text;
begin
 if p_id is null then perform private.require_permission('posts.create');else perform private.require_permission('posts.update');end if;
 if jsonb_typeof(p_patch)<>'object' or octet_length(p_patch::text)>1048576 then raise exception 'INVALID_INPUT';end if;
 for k in select jsonb_object_keys(p_patch) loop if not k=any(array['title','slug','subtitle','excerpt','content','content_json','content_html','author_id','primary_category_id','category_ids','cover_asset_id','thumbnail_asset_id','share_asset_id','media_ids','tags','editorial_keywords','sources','seo_title','seo_description','canonical_url','sharing','visibility','featured','allow_comments','comments_close_at']) then raise exception 'UNKNOWN_FIELD';end if;end loop;
 if p_id is null then insert into public.posts(title,slug,created_by,allow_comments,visibility) values(coalesce(p_patch->>'title','مسودة جديدة'),coalesce(nullif(p_patch->>'slug',''),'draft-'||gen_random_uuid()::text),auth.uid(),coalesce((select (value->>'default_comments')::boolean from public.site_settings where key='publishing'),true),coalesce((select value->>'default_visibility' from public.site_settings where key='publishing'),'public')) returning * into item;
 else select * into item from public.posts where id=p_id for update;if not found then raise exception 'NOT_FOUND';end if;if item.deleted_at is not null or not private.may_edit(item) or (item.status='published' and not private.has_permission('posts.publish')) then raise exception 'FORBIDDEN' using errcode='42501';end if;if p_expected_version is null or item.version<>p_expected_version then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;end if;
 previous_slug=item.slug;
 for k in select unnest(array['cover_asset_id','thumbnail_asset_id','share_asset_id']) loop
 if p_patch?k and nullif(p_patch->>k,'') is not null and not exists(select 1 from public.media_assets where id=(p_patch->>k)::uuid and deleted_at is null and (owner_id=auth.uid() or private.permission_scope_for(auth.uid(),'media.manage')='all')) then raise exception 'INVALID_MEDIA';end if;
 end loop;
 insert into public.post_revisions(post_id,editor_id,snapshot) values(item.id,auth.uid(),private.post_snapshot(item));
 update public.posts set
 title=case when p_patch?'title' then p_patch->>'title' else title end,
 slug=case when p_patch?'slug' then p_patch->>'slug' else slug end,
 subtitle=case when p_patch?'subtitle' then p_patch->>'subtitle' else subtitle end,
 excerpt=case when p_patch?'excerpt' then p_patch->>'excerpt' else excerpt end,
 content=case when p_patch?'content' then p_patch->>'content' else content end,
 content_json=case when p_patch?'content_json' then p_patch->'content_json' else content_json end,
 content_html=case when p_patch?'content_html' then p_patch->>'content_html' else content_html end,
 author_id=case when p_patch?'author_id' then nullif(p_patch->>'author_id','')::uuid else author_id end,
 primary_category_id=case when p_patch?'primary_category_id' then nullif(p_patch->>'primary_category_id','')::uuid else primary_category_id end,
 cover_asset_id=case when p_patch?'cover_asset_id' then nullif(p_patch->>'cover_asset_id','')::uuid else cover_asset_id end,
 thumbnail_asset_id=case when p_patch?'thumbnail_asset_id' then nullif(p_patch->>'thumbnail_asset_id','')::uuid else thumbnail_asset_id end,
 share_asset_id=case when p_patch?'share_asset_id' then nullif(p_patch->>'share_asset_id','')::uuid else share_asset_id end,
 tags=case when p_patch?'tags' then array(select jsonb_array_elements_text(p_patch->'tags')) else tags end,
 editorial_keywords=case when p_patch?'editorial_keywords' then array(select jsonb_array_elements_text(p_patch->'editorial_keywords')) else editorial_keywords end,
 sources=case when p_patch?'sources' then p_patch->'sources' else sources end,
 seo_title=case when p_patch?'seo_title' then p_patch->>'seo_title' else seo_title end,
 seo_description=case when p_patch?'seo_description' then p_patch->>'seo_description' else seo_description end,
 canonical_url=case when p_patch?'canonical_url' then p_patch->>'canonical_url' else canonical_url end,
 sharing=case when p_patch?'sharing' then p_patch->'sharing' else sharing end,
 visibility=case when p_patch?'visibility' then p_patch->>'visibility' else visibility end,
 featured=case when p_patch?'featured' then (p_patch->>'featured')::boolean else featured end,
 allow_comments=case when p_patch?'allow_comments' then (p_patch->>'allow_comments')::boolean else allow_comments end,
 comments_close_at=case when p_patch?'comments_close_at' then nullif(p_patch->>'comments_close_at','')::timestamptz else comments_close_at end,
 version=version+1 where id=item.id returning * into item;
 if p_patch?'category_ids' then
 delete from public.post_categories where post_id=item.id;
 for cat in select value::text::uuid from jsonb_array_elements_text(p_patch->'category_ids') loop if exists(select 1 from public.admin_memberships where user_id=auth.uid() and scope_mode='restricted' and not cat=any(category_ids)) then raise exception 'CATEGORY_SCOPE_FORBIDDEN';end if;
 if not exists(select 1 from public.categories where id=cat and is_active and deleted_at is null) then raise exception 'INVALID_CATEGORY';end if;
 insert into public.post_categories values(item.id,cat) on conflict do nothing;end loop;end if;
 if p_patch?'media_ids' then delete from public.post_media where post_id=item.id;for asset in select value::text::uuid from jsonb_array_elements_text(p_patch->'media_ids') loop
 if not exists(select 1 from public.media_assets where id=asset and deleted_at is null and (owner_id=auth.uid() or private.permission_scope_for(auth.uid(),'media.manage')='all')) then raise exception 'INVALID_MEDIA';end if;
 insert into public.post_media values(item.id,asset) on conflict do nothing;end loop;end if;
 if previous_slug<>item.slug then
 if exists(select 1 from public.slug_redirects where kind='post' and old_slug=item.slug) then raise exception 'SLUG_RESERVED';end if;
 update public.slug_redirects set new_slug=item.slug where kind='post' and new_slug=previous_slug;
 insert into public.slug_redirects(kind,old_slug,new_slug) values('post',previous_slug,item.slug) on conflict(kind,old_slug) do update set new_slug=excluded.new_slug;
 end if;
 if item.status='published' and not private.publication_valid(item) then raise exception 'PUBLICATION_INCOMPLETE';end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'post_saved','post',item.id::text);
 return item;
end $$;
