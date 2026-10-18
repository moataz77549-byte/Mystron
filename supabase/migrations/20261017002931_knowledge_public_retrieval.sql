create or replace function private.ai_post_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from public.ai_chunks where post_id=new.id;delete from private.ai_summary_cache where post_id=new.id;
 insert into public.automation_jobs(kind,dedupe_key,payload) values('index','index:'||new.id||':'||new.version,jsonb_build_object('post_id',new.id,'version',new.version)) on conflict do nothing;return new;
end $$;
revoke all on function private.ai_post_changed() from public,anon,authenticated;
drop trigger if exists ai_post_changed on public.posts;create trigger ai_post_changed after insert or update of title,excerpt,content,status,visibility,deleted_at,published_at,version on public.posts for each row execute function private.ai_post_changed();
create or replace function public.ai_replace_chunks(p_post uuid,p_version bigint,p_model text,p_chunks jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare post public.posts;chunk jsonb;dim int;profile_dim int;
begin
 select * into post from public.posts where id=p_post for update;
 if not found or post.status<>'published' or post.visibility<>'public' or post.deleted_at is not null or post.published_at>now() or post.version<>p_version then return false;end if;
 if jsonb_typeof(p_chunks)<>'array' or jsonb_array_length(p_chunks) not between 1 and 250 or length(p_model) not between 1 and 200 then raise exception 'INVALID_CHUNKS';end if;
 dim=jsonb_array_length(p_chunks->0->'embedding');
 insert into public.ai_embedding_profiles(model_id,dimensions) values(p_model,dim) on conflict do nothing;
 select dimensions into profile_dim from public.ai_embedding_profiles where model_id=p_model;
 if dim<>profile_dim then raise exception 'EMBEDDING_DIMENSION_MISMATCH';end if;
 delete from public.ai_chunks where post_id=p_post;
 for chunk in select value from jsonb_array_elements(p_chunks) loop
 if jsonb_array_length(chunk->'embedding')<>dim then raise exception 'EMBEDDING_DIMENSION_MISMATCH';end if;
 insert into public.ai_chunks(document_id,post_id,chunk_index,chunk_text,embedding,dimensions,embedding_model,content_hash,source_version,source_url,published_at)
 values(p_post,p_post,(chunk->>'index')::int,chunk->>'text',(chunk->'embedding')::text::extensions.vector,dim,p_model,chunk->>'hash',p_version,'/posts/'||post.slug,post.published_at);
 end loop;return true;
end $$;
revoke all on function public.ai_replace_chunks(uuid,bigint,text,jsonb) from public,anon,authenticated;grant execute on function public.ai_replace_chunks(uuid,bigint,text,jsonb) to service_role;
create or replace function public.ai_retrieve(p_query text,p_embedding extensions.vector default null,p_model text default '',p_post uuid default null,p_limit int default 6) returns jsonb language sql stable security definer set search_path='' as $$
 with eligible as materialized(select c.*,p.title from public.ai_chunks c join public.posts p on p.id=c.post_id where p.status='published' and p.visibility='public' and p.deleted_at is null and p.published_at<=now() and p.version=c.source_version and(p_post is null or p.id=p_post)),
 ranked as(select e.*,ts_rank_cd(search_vector,websearch_to_tsquery('simple',public.normalize_arabic(left(p_query,1000)))) keyword_score,case when p_embedding is not null and embedding_model=p_model and dimensions=extensions.vector_dims(p_embedding) then 1-(embedding operator(extensions.<=>) p_embedding) end semantic_score from eligible e),
 result as(select post_id,title,source_url,source_version,chunk_text,chunk_index,(case when keyword_score>0 then 1.0/(60+rank() over(order by keyword_score desc)) else 0 end + case when semantic_score>0.2 then 1.0/(60+rank() over(order by semantic_score desc nulls last)) else 0 end) score from ranked where keyword_score>0 or semantic_score>0.2 or p_post is not null)
 select coalesce(jsonb_agg(x),'[]') from(select * from result order by score desc,post_id,chunk_index limit least(greatest(p_limit,1),8))x
$$;
revoke all on function public.ai_retrieve(text,extensions.vector,text,uuid,int) from public,anon,authenticated;grant execute on function public.ai_retrieve(text,extensions.vector,text,uuid,int) to service_role;
