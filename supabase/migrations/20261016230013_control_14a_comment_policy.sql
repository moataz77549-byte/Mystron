
-- Global comment rules apply to direct server RPC calls too.
create or replace function public.submit_guest_comment(p_post_id uuid,p_parent_id uuid,p_name text,p_email text,p_body text) returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid=gen_random_uuid();parent public.comments;level int=0;policy jsonb;pub jsonb;published timestamptz;
begin
 select value into policy from public.site_settings where key='comments';select value into pub from public.site_settings where key='publishing';
 if coalesce((policy->>'enabled')::boolean,true)=false then raise exception 'COMMENTS_CLOSED';end if;
 if length(trim(p_body)) not between 1 and 5000 or length(trim(p_name)) not between 1 and 100 or p_body ~ '(?i)(https?://|<[^>]+>)' then raise exception 'INVALID_COMMENT';end if;
 if exists(select 1 from jsonb_array_elements_text(coalesce(policy->'blocked_words','[]')) w where strpos(lower(p_body),lower(w))>0) or exists(select 1 from jsonb_array_elements_text(coalesce(policy->'blocked_emails','[]')) e where lower(p_email)=lower(e)) then raise exception 'COMMENT_BLOCKED';end if;
 select published_at into published from public.posts where id=p_post_id and status='published' and visibility='public' and published_at<=now() and deleted_at is null and allow_comments and (comments_close_at is null or comments_close_at>now());
 if not found or (coalesce((pub->>'comments_close_days')::int,0)>0 and published<now()-make_interval(days=>(pub->>'comments_close_days')::int)) then raise exception 'COMMENTS_CLOSED';end if;
 if p_parent_id is not null then
 if not coalesce((policy->>'replies')::boolean,true) then raise exception 'REPLIES_CLOSED';end if;
 select * into parent from public.comments where id=p_parent_id and post_id=p_post_id and status='approved' and deleted_at is null;if not found or parent.depth>=coalesce((policy->>'max_depth')::int,3) then raise exception 'INVALID_PARENT';end if;level=parent.depth+1;end if;
 insert into public.comments(id,post_id,parent_id,depth,guest_name,body,status) values(new_id,p_post_id,p_parent_id,level,p_name,p_body,case when coalesce((policy->>'pre_moderation')::boolean,true) then 'pending' else 'approved' end);
 insert into private.comment_contacts(comment_id,email) values(new_id,nullif(p_email,''));return new_id;
end $$;
create or replace function public.comment_policy_server() returns jsonb language sql stable security definer set search_path='' as $$ select value from public.site_settings where key='comments' $$;
revoke all on function public.comment_policy_server() from public,anon,authenticated;grant execute on function public.comment_policy_server() to service_role;
