create or replace function public.telegram_read(p_telegram_id bigint,p_action text,p_args jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare link public.telegram_links;post public.posts;result jsonb;
begin
 link=private.telegram_actor(p_telegram_id);
 if p_action='identity' then return public.admin_identity()||jsonb_build_object('user_id',link.user_id,'permission_fingerprint',md5(public.admin_identity()::text),'state',coalesce((select state from private.telegram_states where user_id=link.user_id and expires_at>now()),'{}'::jsonb),'state_version',coalesce((select version from private.telegram_states where user_id=link.user_id),0));
 elsif p_action='posts' then
 if not private.has_permission('posts.read') then raise exception 'FORBIDDEN';end if;
 return coalesce((select jsonb_agg(x) from(select p.id,p.title,p.slug,p.excerpt,p.status,p.version,p.scheduled_at,p.author_id,p.primary_category_id from public.posts p where p.deleted_at is null and private.can_post(p,'posts.read') and (coalesce(p_args->>'status','')='' or p.status=p_args->>'status') and (coalesce(p_args->>'q','')='' or p.title ilike '%'||left(p_args->>'q',100)||'%') and (not p_args?'author_id' or p.author_id=(p_args->>'author_id')::uuid) and (not p_args?'category_id' or exists(select 1 from public.post_categories where post_id=p.id and category_id=(p_args->>'category_id')::uuid)) order by p.updated_at desc,p.id limit 10 offset least(greatest(coalesce((p_args->>'page')::int,1),1),1000)*10-10)x),'[]');
 elsif p_action='post' then select * into post from public.posts where id=(p_args->>'id')::uuid and deleted_at is null;if not found or not private.can_post(post,'posts.read') then raise exception 'FORBIDDEN';end if;return to_jsonb(post);
 elsif p_action='ai_source' then select * into post from public.posts where id=(p_args->>'id')::uuid and deleted_at is null;if not found or not private.can_post(post,'posts.update') then raise exception 'FORBIDDEN';end if;return jsonb_build_object('title',post.title,'content',post.content,'status',post.status,'visibility',post.visibility);
 elsif p_action='categories' then
 if not private.has_permission('posts.read') and not private.has_permission('posts.create') and not private.has_permission('categories.manage') then raise exception 'FORBIDDEN';end if;
 return coalesce((select jsonb_agg(x) from(select id,name from public.categories c where is_active and deleted_at is null and (exists(select 1 from public.admin_memberships a where a.user_id=link.user_id and a.scope_mode='all') or exists(select 1 from public.admin_memberships a where a.user_id=link.user_id and c.id=any(a.category_ids))) order by sort_order limit 30)x),'[]');
 elsif p_action='authors' then
 if not private.has_permission('posts.create') and not private.has_permission('posts.read') then raise exception 'FORBIDDEN';end if;
 return coalesce((select jsonb_agg(x) from(select id,display_name from public.authors where is_active and deleted_at is null order by sort_order limit 30)x),'[]');
 elsif p_action='comments' then
 if not private.has_permission('comments.moderate') then raise exception 'FORBIDDEN';end if;
 return coalesce((select jsonb_agg(x) from(select c.id,c.body,c.guest_name,c.created_at,p.title,p.slug,p.id post_id from public.comments c join public.posts p on p.id=c.post_id where c.status='pending' and c.deleted_at is null and private.can_post(p,'comments.moderate') order by c.created_at limit 10)x),'[]');
 elsif p_action='dashboard' then return public.admin_dashboard();
 elsif p_action='notifications' then
 if not private.has_permission('notifications.read') then raise exception 'FORBIDDEN';end if;
 return coalesce((select jsonb_agg(x) from(select id,title,href,priority from public.admin_notifications where user_id=link.user_id and archived_at is null order by created_at desc limit 10)x),'[]');
 elsif p_action='comment' then
 if not private.has_permission('comments.moderate') then raise exception 'FORBIDDEN';end if;
 select jsonb_build_object('id',c.id,'body',c.body,'guest_name',c.guest_name,'created_at',c.created_at,'title',p.title,'slug',p.slug,'post_id',p.id) into result from public.comments c join public.posts p on p.id=c.post_id where c.id=(p_args->>'id')::uuid and c.status='pending' and c.deleted_at is null and private.can_post(p,'comments.moderate');if result is null then raise exception 'NOT_FOUND';end if;return result;
 elsif p_action='preferences' then return link.preferences;
 else raise exception 'INVALID_ACTION';end if;
end $$;
revoke all on function public.telegram_read(bigint,text,jsonb) from public,anon,authenticated;grant execute on function public.telegram_read(bigint,text,jsonb) to service_role;
