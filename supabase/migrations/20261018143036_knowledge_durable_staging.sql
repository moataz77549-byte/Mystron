create or replace function public.ai_stage_batch(p_id uuid,p_lease uuid,p_model text,p_chunks jsonb,p_done boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare job public.automation_jobs;post public.posts;chunk jsonb;all_chunks jsonb;
begin
 select * into job from public.automation_jobs where id=p_id and lease_token=p_lease and kind='index' and status='running' and lease_until>now() for update;if not found then raise exception 'STALE_LEASE';end if;
 select * into post from public.posts where id=(job.payload->>'post_id')::uuid for update;
 if not found or post.status<>'published' or post.visibility<>'public' or post.deleted_at is not null or post.published_at>now() or post.version<>(job.payload->>'version')::bigint then delete from public.ai_index_staging where job_id=p_id;perform public.automation_finish(p_id,p_lease,true,null);return false;end if;
 if job.payload->>'model_key' is distinct from p_model then raise exception 'INDEX_MODEL_CHANGED';end if;
 if jsonb_array_length(p_chunks)>16 then raise exception 'BATCH_TOO_LARGE';end if;
 for chunk in select value from jsonb_array_elements(p_chunks) loop
 insert into public.ai_index_staging values(p_id,(chunk->>'index')::int,chunk->>'text',(chunk->'embedding')::text::extensions.vector,chunk->>'hash') on conflict(job_id,chunk_index) do update set chunk_text=excluded.chunk_text,embedding=excluded.embedding,content_hash=excluded.content_hash;end loop;
 if p_done then
 select jsonb_agg(jsonb_build_object('index',chunk_index,'text',chunk_text,'hash',content_hash,'embedding',embedding::text::jsonb) order by chunk_index) into all_chunks from public.ai_index_staging where job_id=p_id;
 if all_chunks is not null then perform public.ai_replace_chunks(post.id,post.version,p_model,all_chunks);end if;
 delete from public.ai_index_staging where job_id=p_id;perform public.automation_finish(p_id,p_lease,true,null);
 else
 update public.automation_jobs set status='pending',attempts=0,available_at=now(),lease_until=null,payload=jsonb_set(payload,'{cursor}',to_jsonb((select coalesce(max(chunk_index),-1)+1 from public.ai_index_staging where job_id=p_id))) where id=p_id;
 end if;return true;
end $$;
revoke all on function public.ai_stage_batch(uuid,uuid,text,jsonb,boolean) from public,anon,authenticated;grant execute on function public.ai_stage_batch(uuid,uuid,text,jsonb,boolean) to service_role;
create or replace function public.automation_defer(p_id uuid,p_lease uuid) returns void language plpgsql security definer set search_path='' as $$
begin update public.automation_jobs set status='pending',attempts=greatest(attempts-1,0),available_at=now()+interval '15 minutes',lease_until=null,last_error='UNCONFIGURED' where id=p_id and lease_token=p_lease and status='running' and lease_until>now();if not found then raise exception 'STALE_LEASE';end if;end $$;
revoke all on function public.automation_defer(uuid,uuid) from public,anon,authenticated;grant execute on function public.automation_defer(uuid,uuid) to service_role;

alter table public.admin_notifications add column if not exists context jsonb not null default '{}';
create or replace function private.control_notify() returns trigger language plpgsql security definer set search_path='' as $$
declare required text;link text;heading text;post public.posts;recipient record;
begin
 if tg_table_name='posts' then
 if new.status<>'review' or (tg_op='UPDATE' and old.status='review') then return new;end if;required='posts.publish';link='/admin/posts/'||new.id||'/edit';heading='تدوينة تنتظر المراجعة';post=new;
 elsif tg_table_name='comments' then
 if new.status<>'pending' then return new;end if;required='comments.moderate';link='/admin/comments';heading='تعليق ينتظر الموافقة';select * into post from public.posts where id=new.post_id;
 elsif tg_table_name='publishing_runs' then
 if new.status<>'failed' then return new;end if;required='posts.schedule';link='/admin/scheduled';heading='فشل نشر مجدول';select * into post from public.posts where id=new.post_id;
 else return new;end if;
 for recipient in select user_id,scope_mode,category_ids from public.admin_memberships where enabled loop
 if private.permission_scope_for(recipient.user_id,required) is not null and (private.permission_scope_for(recipient.user_id,required)='all' or post.created_by=recipient.user_id) and (recipient.scope_mode='all' or not exists(select 1 from public.post_categories pc where pc.post_id=post.id and not pc.category_id=any(recipient.category_ids))) then
 insert into public.admin_notifications(user_id,kind,title,href,priority,context) values(recipient.user_id,tg_table_name,heading,link,case when tg_table_name='publishing_runs' then 'high' else 'normal' end,jsonb_build_object('post_id',post.id,'comment_id',case when tg_table_name='comments' then new.id else null end));end if;end loop;return new;
end $$;
