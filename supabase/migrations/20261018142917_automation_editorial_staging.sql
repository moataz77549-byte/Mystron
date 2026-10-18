create or replace function public.ai_editorial_source(p_post uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare post public.posts;
begin select * into post from public.posts where id=p_post and deleted_at is null;if not found or not private.can_post(post,'posts.update') then raise exception 'FORBIDDEN';end if;return jsonb_build_object('title',post.title,'content',post.content,'status',post.status,'visibility',post.visibility);end $$;
revoke all on function public.ai_editorial_source(uuid) from public,anon;grant execute on function public.ai_editorial_source(uuid) to authenticated;
create table if not exists public.ai_index_staging(job_id uuid not null references public.automation_jobs(id) on delete cascade,chunk_index int not null,chunk_text text not null,embedding extensions.vector not null,content_hash text not null,primary key(job_id,chunk_index));
alter table public.ai_index_staging enable row level security;revoke all on public.ai_index_staging from public,anon,authenticated;grant all on public.ai_index_staging to service_role;
