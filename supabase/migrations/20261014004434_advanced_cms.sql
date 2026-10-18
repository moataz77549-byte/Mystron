-- Stage 2: extend the existing foundation without duplicating content/auth tables.
alter table public.posts drop constraint if exists posts_status_check;
alter table public.posts add constraint posts_status_check check(status in ('draft','review','scheduled','published','archived','unpublished'));
alter table public.posts add column if not exists subtitle text;
alter table public.posts add column if not exists content_json jsonb not null default '{"type":"doc","content":[]}'::jsonb;
alter table public.posts add column if not exists content_html text not null default '';
alter table public.posts add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.posts add column if not exists primary_category_id uuid references public.categories(id) on delete restrict;
alter table public.posts add column if not exists cover_asset_id uuid;
alter table public.posts add column if not exists thumbnail_asset_id uuid;
alter table public.posts add column if not exists share_asset_id uuid;
alter table public.posts add column if not exists tags text[] not null default '{}';
alter table public.posts add column if not exists editorial_keywords text[] not null default '{}';
alter table public.posts add column if not exists sources jsonb not null default '[]';
alter table public.posts add column if not exists canonical_url text;
alter table public.posts add column if not exists sharing jsonb not null default '{}';
alter table public.posts add column if not exists allow_comments boolean not null default true;
alter table public.posts add column if not exists comments_close_at timestamptz;
alter table public.posts add column if not exists version bigint not null default 1;
alter table public.posts add column if not exists scheduled_by uuid references auth.users(id) on delete set null;
alter table public.posts add column if not exists schedule_attempts int not null default 0;
alter table public.posts add column if not exists next_schedule_attempt_at timestamptz;
alter table public.posts add column if not exists last_schedule_error text;
alter table public.categories add column if not exists parent_id uuid references public.categories(id) on delete restrict;
alter table public.categories add column if not exists image_asset_id uuid;
alter table public.categories add column if not exists icon text;
alter table public.authors add column if not exists short_name text;
alter table public.authors add column if not exists avatar_asset_id uuid;
alter table public.authors add column if not exists country text;
alter table public.authors add column if not exists city text;
alter table public.authors add column if not exists website text;
alter table public.authors add column if not exists links jsonb not null default '{}';
alter table public.authors add column if not exists sort_order int not null default 0;
alter table public.media_assets drop constraint if exists media_assets_mime_type_check;
alter table public.media_assets add constraint media_assets_mime_type_check check(mime_type in ('image/jpeg','image/png','image/webp','image/avif','image/gif'));
alter table public.media_assets add column if not exists display_name text not null default '';
alter table public.media_assets add column if not exists caption text;
alter table public.media_assets add column if not exists folder text not null default '';
alter table public.media_assets add column if not exists width int;
alter table public.media_assets add column if not exists height int;
alter table public.media_assets add column if not exists animated boolean not null default false;
alter table public.media_assets add column if not exists variants jsonb not null default '{}';
alter table public.media_assets add column if not exists visibility text not null default 'private' check(visibility in ('private','public'));
alter table public.media_assets add column if not exists checksum text;
alter table public.media_assets add column if not exists updated_at timestamptz not null default now();
do $$ begin
 if not exists(select 1 from pg_constraint where conname='posts_cover_asset_fk') then alter table public.posts add constraint posts_cover_asset_fk foreign key(cover_asset_id) references public.media_assets(id) on delete restrict;end if;
 if not exists(select 1 from pg_constraint where conname='posts_thumbnail_asset_fk') then alter table public.posts add constraint posts_thumbnail_asset_fk foreign key(thumbnail_asset_id) references public.media_assets(id) on delete restrict;end if;
 if not exists(select 1 from pg_constraint where conname='posts_share_asset_fk') then alter table public.posts add constraint posts_share_asset_fk foreign key(share_asset_id) references public.media_assets(id) on delete restrict;end if;
 if not exists(select 1 from pg_constraint where conname='authors_avatar_asset_fk') then alter table public.authors add constraint authors_avatar_asset_fk foreign key(avatar_asset_id) references public.media_assets(id) on delete restrict;end if;
 if not exists(select 1 from pg_constraint where conname='categories_image_asset_fk') then alter table public.categories add constraint categories_image_asset_fk foreign key(image_asset_id) references public.media_assets(id) on delete restrict;end if;
end $$;
create table if not exists public.post_media(post_id uuid references public.posts(id) on delete cascade,asset_id uuid references public.media_assets(id) on delete restrict,primary key(post_id,asset_id));
create table if not exists public.slug_redirects(kind text not null check(kind in ('post','category','author')),old_slug text not null,new_slug text not null,created_at timestamptz not null default now(),primary key(kind,old_slug),check(old_slug<>new_slug));
create table if not exists public.publishing_runs(id uuid primary key default gen_random_uuid(),post_id uuid references public.posts(id) on delete set null,status text not null check(status in ('success','failed')),reason text,trigger text not null,created_at timestamptz not null default now());
alter table public.comments drop constraint if exists comments_status_check;
alter table public.comments add constraint comments_status_check check(status in ('pending','approved','rejected','hidden'));
alter table public.comments add column if not exists parent_id uuid references public.comments(id) on delete restrict;
alter table public.comments add column if not exists depth int not null default 0 check(depth between 0 and 3);
alter table public.comments add column if not exists guest_name text;
alter table public.comments add column if not exists updated_at timestamptz not null default now();
create table if not exists private.comment_contacts(comment_id uuid primary key references public.comments(id) on delete cascade,email text);
create table if not exists public.comment_reports(id uuid primary key default gen_random_uuid(),comment_id uuid not null references public.comments(id) on delete cascade,reason text not null check(length(reason) between 3 and 1000),visitor_hash text not null,created_at timestamptz not null default now(),unique(comment_id,visitor_hash));
alter table public.ticker_items add column if not exists image_asset_id uuid references public.media_assets(id) on delete restrict;
alter table public.ticker_items add column if not exists style text not null default 'navy' check(style in ('navy','gold','teal','burgundy'));
alter table public.ticker_items add column if not exists pages text[] not null default '{}';
alter table public.ticker_items add column if not exists placement text not null default 'ticker' check(placement in ('ticker','article'));
alter table public.ticker_items add column if not exists sponsored boolean not null default false;
create or replace function public.normalize_arabic(value text) returns text language sql immutable set search_path='' as $$ select lower(translate(regexp_replace(coalesce(value,''),'[ًٌٍَُِّْٰـؐ-ؚۖ-ۭ]','','g'),'أإآٱى','ااااي')) $$;
alter table public.posts add column if not exists search_vector tsvector generated always as (setweight(to_tsvector('simple',public.normalize_arabic(title)),'A')||setweight(to_tsvector('simple',public.normalize_arabic(coalesce(excerpt,''))),'B')||setweight(to_tsvector('simple',public.normalize_arabic(content)),'C')) stored;
create index if not exists posts_search_gin on public.posts using gin(search_vector);
create index if not exists posts_created_by_idx on public.posts(created_by);
create index if not exists posts_primary_category_idx on public.posts(primary_category_id);
create index if not exists posts_cover_asset_idx on public.posts(cover_asset_id);
create index if not exists posts_thumbnail_asset_idx on public.posts(thumbnail_asset_id);
create index if not exists posts_share_asset_idx on public.posts(share_asset_id);
create index if not exists posts_scheduled_by_idx on public.posts(scheduled_by);
create index if not exists categories_parent_idx on public.categories(parent_id);
create index if not exists categories_image_idx on public.categories(image_asset_id);
create index if not exists authors_avatar_idx on public.authors(avatar_asset_id);
create index if not exists ticker_image_idx on public.ticker_items(image_asset_id);
create index if not exists post_media_asset_idx on public.post_media(asset_id,post_id);
create index if not exists comments_parent_idx on public.comments(parent_id);
create index if not exists comments_public_idx on public.comments(post_id,created_at) where status='approved' and deleted_at is null;
create index if not exists comment_reports_comment_idx on public.comment_reports(comment_id);
create index if not exists publishing_runs_post_idx on public.publishing_runs(post_id,created_at desc);
create index if not exists posts_due_idx on public.posts(scheduled_at) where status='scheduled' and deleted_at is null;
create or replace function private.has_role(allowed text[]) returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and exists(select 1 from auth.users u join public.user_roles ur on ur.user_id=u.id join public.roles r on r.id=ur.role_id where u.id=auth.uid() and u.email_confirmed_at is not null and r.name=any(allowed)) $$;
revoke all on function private.has_role(text[]) from public,anon;
grant execute on function private.has_role(text[]) to authenticated;
create or replace function private.may_edit(p public.posts) returns boolean language sql stable security definer set search_path='' as $$ select private.has_role(array['OWNER','ADMIN','EDITOR']) or (private.has_role(array['AUTHOR']) and p.created_by=auth.uid() and p.status in ('draft','unpublished')) $$;
revoke all on function private.may_edit(public.posts) from public,anon;
grant execute on function private.may_edit(public.posts) to authenticated;
create or replace function private.is_staff() returns boolean language sql stable security definer set search_path='' as $$ select private.has_role(array['OWNER','ADMIN','EDITOR']) $$;
create or replace function private.post_snapshot(item public.posts) returns jsonb language sql stable security definer set search_path='' as $$ select to_jsonb(item)||jsonb_build_object('category_ids',coalesce((select jsonb_agg(category_id) from public.post_categories where post_id=item.id),'[]'::jsonb),'media_ids',coalesce((select jsonb_agg(asset_id) from public.post_media where post_id=item.id),'[]'::jsonb)) $$;
revoke all on function private.post_snapshot(public.posts) from public,anon,authenticated;
-- Read own editorial work without gaining other staff permissions.
drop policy if exists authenticated_read on public.posts;
create policy authenticated_read on public.posts for select to authenticated using ((status='published' and visibility='public' and deleted_at is null and published_at<=now()) or (select private.has_role(array['OWNER','ADMIN','EDITOR'])) or (created_by=(select auth.uid()) and (select private.has_role(array['AUTHOR']))));
drop policy if exists own_revisions on public.post_revisions;
create policy own_revisions on public.post_revisions for select to authenticated using(exists(select 1 from public.posts p where p.id=post_id and p.created_by=(select auth.uid())));
drop policy if exists media_owner_read on public.media_assets;
create policy media_owner_read on public.media_assets for select to authenticated using(owner_id=(select auth.uid()) and deleted_at is null);
grant select on public.media_assets to anon;
drop policy if exists published_media_read on public.media_assets;
create policy published_media_read on public.media_assets for select to anon using(deleted_at is null and visibility='public' and (exists(select 1 from public.post_media pm join public.posts p on p.id=pm.post_id where pm.asset_id=public.media_assets.id) or exists(select 1 from public.posts p where p.cover_asset_id=public.media_assets.id or p.thumbnail_asset_id=public.media_assets.id or p.share_asset_id=public.media_assets.id) or exists(select 1 from public.authors a where a.avatar_asset_id=public.media_assets.id) or exists(select 1 from public.categories c where c.image_asset_id=public.media_assets.id) or exists(select 1 from public.ticker_items t where t.image_asset_id=public.media_assets.id)));
-- Authenticated authors must be able to read their own category joins.
drop policy if exists authenticated_read on public.post_categories;
create policy authenticated_read on public.post_categories for select to authenticated using(exists(select 1 from public.posts p where p.id=post_id));
alter table public.post_media enable row level security;
revoke all on public.post_media from anon,authenticated;
grant all on public.post_media to service_role;
alter table public.slug_redirects enable row level security;
revoke all on public.slug_redirects from anon,authenticated;
grant all on public.slug_redirects to service_role;
alter table public.publishing_runs enable row level security;
revoke all on public.publishing_runs from anon,authenticated;
grant all on public.publishing_runs to service_role;
alter table public.comment_reports enable row level security;
revoke all on public.comment_reports from anon,authenticated;
grant all on public.comment_reports to service_role;
alter table private.comment_contacts enable row level security;
revoke all on private.comment_contacts from public,anon,authenticated;
grant select on public.post_media,public.slug_redirects to anon,authenticated;
grant select on public.publishing_runs,public.comment_reports to authenticated;
drop policy if exists read_links on public.post_media;
create policy read_links on public.post_media for select to anon,authenticated using(exists(select 1 from public.posts p where p.id=post_id));
drop policy if exists read_redirects on public.slug_redirects;
create policy read_redirects on public.slug_redirects for select to anon,authenticated using(true);
drop policy if exists staff_read on public.publishing_runs;
create policy staff_read on public.publishing_runs for select to authenticated using((select private.has_role(array['OWNER','ADMIN','EDITOR'])));
drop policy if exists staff_read on public.comment_reports;
create policy staff_read on public.comment_reports for select to authenticated using((select private.has_role(array['OWNER','ADMIN','EDITOR'])));
grant select(id,post_id,parent_id,depth,guest_name,body,status,created_at,updated_at) on public.comments to anon;
drop policy if exists public_comments on public.comments;
create policy public_comments on public.comments for select to anon using(status='approved' and deleted_at is null and exists(select 1 from public.posts p where p.id=post_id and p.allow_comments));
-- Authenticated mutation RPC: derives actor from validated identity, never from a client field.
create or replace function public.cms_save_post(p_id uuid,p_patch jsonb,p_expected_version bigint default null) returns public.posts language plpgsql security definer set search_path='' as $$
declare item public.posts;previous_slug text;cat uuid;asset uuid;k text;
begin
 if not private.has_role(array['OWNER','ADMIN','EDITOR','AUTHOR']) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if jsonb_typeof(p_patch)<>'object' or octet_length(p_patch::text)>1048576 then raise exception 'INVALID_INPUT';end if;
 for k in select jsonb_object_keys(p_patch) loop if not k=any(array['title','slug','subtitle','excerpt','content','content_json','content_html','author_id','primary_category_id','category_ids','cover_asset_id','thumbnail_asset_id','share_asset_id','media_ids','tags','editorial_keywords','sources','seo_title','seo_description','canonical_url','sharing','visibility','featured','allow_comments','comments_close_at']) then raise exception 'UNKNOWN_FIELD';end if;end loop;
 if p_id is null then insert into public.posts(title,slug,created_by,allow_comments,visibility) values(coalesce(p_patch->>'title','مسودة جديدة'),coalesce(nullif(p_patch->>'slug',''),'draft-'||gen_random_uuid()::text),auth.uid(),coalesce((select (value->>'default_comments')::boolean from public.site_settings where key='publishing'),true),coalesce((select value->>'default_visibility' from public.site_settings where key='publishing'),'public')) returning * into item;
 else select * into item from public.posts where id=p_id for update;if not found then raise exception 'NOT_FOUND';end if;if item.deleted_at is not null or not private.may_edit(item) then raise exception 'FORBIDDEN' using errcode='42501';end if;if p_expected_version is null or item.version<>p_expected_version then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;end if;
 previous_slug=item.slug;
 for k in select unnest(array['cover_asset_id','thumbnail_asset_id','share_asset_id']) loop
 if p_patch?k and nullif(p_patch->>k,'') is not null and not exists(select 1 from public.media_assets where id=(p_patch->>k)::uuid and deleted_at is null and (owner_id=auth.uid() or private.has_role(array['OWNER','ADMIN','EDITOR']))) then raise exception 'INVALID_MEDIA';end if;
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
 for cat in select value::text::uuid from jsonb_array_elements_text(p_patch->'category_ids') loop
 if not exists(select 1 from public.categories where id=cat and is_active and deleted_at is null) then raise exception 'INVALID_CATEGORY';end if;
 insert into public.post_categories values(item.id,cat) on conflict do nothing;end loop;end if;
 if p_patch?'media_ids' then delete from public.post_media where post_id=item.id;for asset in select value::text::uuid from jsonb_array_elements_text(p_patch->'media_ids') loop
 if not exists(select 1 from public.media_assets where id=asset and deleted_at is null and (owner_id=auth.uid() or private.has_role(array['OWNER','ADMIN','EDITOR']))) then raise exception 'INVALID_MEDIA';end if;
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
create or replace function private.publication_valid(p public.posts) returns boolean language sql stable security definer set search_path='' as $$ select p.deleted_at is null and length(trim(p.title))>0 and length(trim(p.content))>0 and jsonb_typeof(p.content_json)='object' and p.content_json->>'type'='doc' and exists(select 1 from public.authors a where a.id=p.author_id and a.is_active and a.deleted_at is null) and exists(select 1 from public.categories c join public.post_categories pc on pc.category_id=c.id where pc.post_id=p.id and c.id=p.primary_category_id and c.is_active and c.deleted_at is null) $$;
revoke all on function private.publication_valid(public.posts) from public,anon,authenticated;
create or replace function public.cms_transition_post(p_id uuid,p_action text,p_expected_version bigint,p_scheduled_at timestamptz default null) returns public.posts language plpgsql security definer set search_path='' as $$
declare item public.posts;new_id uuid;actor uuid=auth.uid();publisher boolean;rev public.post_revisions;
begin
 if not private.has_role(array['OWNER','ADMIN','EDITOR','AUTHOR']) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 publisher=private.has_role(array['OWNER','ADMIN','EDITOR']);
 select * into item from public.posts where id=p_id for update;if not found then raise exception 'NOT_FOUND';end if;
 if item.version<>p_expected_version then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;
 if not publisher and not (item.created_by=actor and private.has_role(array['AUTHOR']) and item.status in ('draft','unpublished') and p_action in ('review','delete','duplicate')) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if item.deleted_at is not null and p_action<>'restore' then raise exception 'POST_DELETED';end if;
 insert into public.post_revisions(post_id,editor_id,snapshot) values(item.id,actor,private.post_snapshot(item));
 if p_action='duplicate' then
 new_id=gen_random_uuid();insert into public.posts(id,title,slug,subtitle,excerpt,content,content_json,content_html,author_id,primary_category_id,cover_asset_id,thumbnail_asset_id,share_asset_id,tags,sources,created_by)
 values(new_id,item.title||' — نسخة','draft-'||new_id::text,item.subtitle,item.excerpt,item.content,item.content_json,item.content_html,item.author_id,item.primary_category_id,item.cover_asset_id,item.thumbnail_asset_id,item.share_asset_id,item.tags,item.sources,actor);
 insert into public.post_categories select new_id,category_id from public.post_categories where post_id=item.id;
 insert into public.post_media select new_id,asset_id from public.post_media where post_id=item.id;
 select * into item from public.posts where id=new_id;
 else
 if p_action in ('publish','scheduled') and not private.publication_valid(item) then raise exception 'PUBLICATION_INCOMPLETE';end if;
 if p_action='scheduled' and (p_scheduled_at is null or p_scheduled_at<=now()) then raise exception 'INVALID_SCHEDULE';end if;
 if p_action='publish' then update public.posts set status='published',comments_close_at=coalesce(comments_close_at,case when coalesce((select (value->>'comments_close_days')::int from public.site_settings where key='publishing'),0)>0 then now()+make_interval(days => coalesce((select (value->>'comments_close_days')::int from public.site_settings where key='publishing'),0)) end),published_at=coalesce(published_at,now()),scheduled_at=null,scheduled_by=null,version=version+1 where id=p_id;
 elsif p_action='scheduled' then update public.posts set status='scheduled',scheduled_at=p_scheduled_at,scheduled_by=actor,schedule_attempts=0,next_schedule_attempt_at=null,last_schedule_error=null,version=version+1 where id=p_id;
 elsif p_action in ('draft','review','archived','unpublished') then update public.posts set status=p_action,scheduled_at=null,scheduled_by=null,version=version+1 where id=p_id;
 elsif p_action='delete' then update public.posts set deleted_at=now(),scheduled_at=null,version=version+1 where id=p_id;
 elsif p_action='restore' then update public.posts set deleted_at=null,status='draft',scheduled_at=null,version=version+1 where id=p_id;
 else raise exception 'INVALID_ACTION';end if;
 select * into item from public.posts where id=p_id;
 if p_action='publish' then
 update public.media_assets set visibility='public' where id in(select asset_id from public.post_media where post_id=p_id) or id in(item.cover_asset_id,item.thumbnail_asset_id,item.share_asset_id);
 insert into public.publishing_runs(post_id,status,trigger) values(p_id,'success','manual');end if;
 end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(actor,'post_'||p_action,'post',item.id::text);return item;
end $$;
create or replace function public.cms_restore_revision(p_revision_id uuid,p_expected_version bigint) returns public.posts language plpgsql security definer set search_path='' as $$
declare rev public.post_revisions;item public.posts;patch jsonb;
begin
 select * into rev from public.post_revisions where id=p_revision_id;if not found then raise exception 'NOT_FOUND';end if;
 select * into item from public.posts where id=rev.post_id for update;
 if not private.may_edit(item) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 -- Revisions restore editable content only, never publication state or ownership.
 patch=jsonb_build_object('title',rev.snapshot->'title','slug',rev.snapshot->'slug','subtitle',rev.snapshot->'subtitle','excerpt',rev.snapshot->'excerpt','content',rev.snapshot->'content','content_json',rev.snapshot->'content_json','content_html',rev.snapshot->'content_html','author_id',rev.snapshot->'author_id','primary_category_id',rev.snapshot->'primary_category_id','tags',rev.snapshot->'tags','sources',rev.snapshot->'sources','seo_title',rev.snapshot->'seo_title','seo_description',rev.snapshot->'seo_description','cover_asset_id',rev.snapshot->'cover_asset_id','thumbnail_asset_id',rev.snapshot->'thumbnail_asset_id','share_asset_id',rev.snapshot->'share_asset_id','category_ids',coalesce(rev.snapshot->'category_ids','[]'),'media_ids',coalesce(rev.snapshot->'media_ids','[]'),'editorial_keywords',coalesce(rev.snapshot->'editorial_keywords','[]'),'canonical_url',rev.snapshot->'canonical_url','allow_comments',rev.snapshot->'allow_comments','featured',rev.snapshot->'featured','sharing',coalesce(rev.snapshot->'sharing','{}'));
 return public.cms_save_post(item.id,patch,p_expected_version);
end $$;
create or replace function private.publish_due() returns integer language plpgsql security definer set search_path='' as $$
declare item public.posts;published int=0;
begin
 for item in select * from public.posts where status='scheduled' and scheduled_at<=now() and deleted_at is null and (next_schedule_attempt_at is null or next_schedule_attempt_at<=now()) order by scheduled_at for update skip locked loop
 if private.publication_valid(item) and exists(select 1 from auth.users u join public.user_roles ur on ur.user_id=u.id join public.roles r on r.id=ur.role_id where u.id=item.scheduled_by and u.email_confirmed_at is not null and r.name in ('OWNER','ADMIN','EDITOR')) then
 insert into public.post_revisions(post_id,editor_id,snapshot) values(item.id,item.scheduled_by,private.post_snapshot(item));
 update public.posts set status='published',comments_close_at=coalesce(comments_close_at,case when coalesce((select (value->>'comments_close_days')::int from public.site_settings where key='publishing'),0)>0 then now()+make_interval(days => coalesce((select (value->>'comments_close_days')::int from public.site_settings where key='publishing'),0)) end),published_at=coalesce(published_at,now()),scheduled_at=null,version=version+1,last_schedule_error=null where id=item.id;
 update public.media_assets set visibility='public' where id in(select asset_id from public.post_media where post_id=item.id) or id in(item.cover_asset_id,item.thumbnail_asset_id,item.share_asset_id);
 insert into public.publishing_runs(post_id,status,trigger) values(item.id,'success','scheduled');
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(item.scheduled_by,'post_published_scheduled','post',item.id::text);published=published+1;
 else
 update public.posts set schedule_attempts=schedule_attempts+1,next_schedule_attempt_at=now()+interval '15 minutes',last_schedule_error='Publication validation or publisher role failed',status=case when schedule_attempts>=4 then 'review' else status end where id=item.id;
 insert into public.publishing_runs(post_id,status,reason,trigger) values(item.id,'failed','Publication validation or publisher role failed','scheduled');
 end if;end loop;return published;
end $$;
revoke all on function private.publish_due() from public,anon,authenticated;
-- Background job is operator-owned. No public callable scheduler or unprotected cron URL.

create or replace function public.cms_save_category(p_id uuid,p_patch jsonb,p_transfer_to uuid default null) returns public.categories language plpgsql security definer set search_path='' as $$
declare item public.categories;previous_slug text;parent uuid;action text=coalesce(p_patch->>'action','save');k text;
begin
 if not private.has_role(array['OWNER','ADMIN','EDITOR']) then raise exception 'FORBIDDEN' using errcode='42501';end if;
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
 if item.image_asset_id is not null then if not exists(select 1 from public.media_assets where id=item.image_asset_id and deleted_at is null) then raise exception 'INVALID_MEDIA';end if;update public.media_assets set visibility='public' where id=item.image_asset_id;end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'category_'||action,'category',item.id::text);return item;
end $$;
create or replace function public.cms_save_author(p_id uuid,p_patch jsonb) returns public.authors language plpgsql security definer set search_path='' as $$
declare item public.authors;previous_slug text;k text;
begin
 if not private.has_role(array['OWNER','ADMIN','EDITOR']) then raise exception 'FORBIDDEN' using errcode='42501';end if;
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
 if not private.has_role(array['OWNER','ADMIN','EDITOR','AUTHOR']) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 for k in select jsonb_object_keys(p_asset) loop if not k=any(array['id','path','mime_type','size_bytes','display_name','alt_text','caption','folder','width','height','animated','variants','checksum']) then raise exception 'UNKNOWN_FIELD';end if;end loop;
 if not (p_asset->>'path' like auth.uid()::text||'/'||(p_asset->>'id')||'/%') or p_asset->>'path' like '%..%' then raise exception 'INVALID_PATH';end if;if exists(select 1 from jsonb_each_text(coalesce(p_asset->'variants','{}')) v where v.key not in ('optimized','thumbnail','social') or v.value not like auth.uid()::text||'/'||(p_asset->>'id')||'/%' or v.value like '%..%') then raise exception 'INVALID_PATH';end if;
 if coalesce((p_asset->>'width')::int,0) not between 1 and 20000 or coalesce((p_asset->>'height')::int,0) not between 1 and 20000 then raise exception 'INVALID_DIMENSIONS';end if;
 insert into public.media_assets(id,owner_id,path,mime_type,size_bytes,display_name,alt_text,caption,folder,width,height,animated,variants,checksum)
 values((p_asset->>'id')::uuid,auth.uid(),p_asset->>'path',p_asset->>'mime_type',(p_asset->>'size_bytes')::bigint,coalesce(p_asset->>'display_name',''),p_asset->>'alt_text',p_asset->>'caption',coalesce(p_asset->>'folder',''),(p_asset->>'width')::int,(p_asset->>'height')::int,coalesce((p_asset->>'animated')::boolean,false),coalesce(p_asset->'variants','{}'),p_asset->>'checksum') returning * into item;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'media_uploaded','media',item.id::text);return item;
end $$;
create or replace function public.cms_update_media(p_id uuid,p_patch jsonb) returns public.media_assets language plpgsql security definer set search_path='' as $$
declare item public.media_assets;k text;
begin
 select * into item from public.media_assets where id=p_id for update;if not found then raise exception 'NOT_FOUND';end if;
 if not private.has_role(array['OWNER','ADMIN','EDITOR','AUTHOR']) or not (item.owner_id=auth.uid() or private.has_role(array['OWNER','ADMIN','EDITOR'])) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 for k in select jsonb_object_keys(p_patch) loop if not k=any(array['display_name','alt_text','caption','folder','action']) then raise exception 'UNKNOWN_FIELD';end if;end loop;
 if p_patch->>'action'='delete' then
 if exists(select 1 from public.post_media where asset_id=p_id) or exists(select 1 from public.posts where cover_asset_id=p_id or thumbnail_asset_id=p_id or share_asset_id=p_id) or exists(select 1 from public.authors where avatar_asset_id=p_id) or exists(select 1 from public.categories where image_asset_id=p_id) or exists(select 1 from public.ticker_items where image_asset_id=p_id) then raise exception 'MEDIA_IN_USE';end if;
 update public.media_assets set deleted_at=now() where id=p_id returning * into item;
 else
 update public.media_assets set display_name=coalesce(p_patch->>'display_name',display_name),alt_text=case when p_patch?'alt_text' then p_patch->>'alt_text' else alt_text end,caption=case when p_patch?'caption' then p_patch->>'caption' else caption end,folder=coalesce(p_patch->>'folder',folder),updated_at=now() where id=p_id returning * into item;
 end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'media_updated','media',item.id::text);return item;
end $$;
create or replace function public.cms_moderate_comment(p_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_role(array['OWNER','ADMIN','EDITOR']) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_action='delete' then update public.comments set deleted_at=now(),status='hidden',updated_at=now() where id=p_id;
 elsif p_action in ('approved','rejected','hidden','pending') then update public.comments set status=p_action,updated_at=now() where id=p_id;
 else raise exception 'INVALID_ACTION';end if;
 if not found then raise exception 'NOT_FOUND';end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'comment_'||p_action,'comment',p_id::text);
end $$;
create or replace function public.cms_save_ticker(p_id uuid,p_patch jsonb) returns public.ticker_items language plpgsql security definer set search_path='' as $$
declare item public.ticker_items;k text;
begin
 if not private.has_role(array['OWNER','ADMIN','EDITOR']) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 for k in select jsonb_object_keys(p_patch) loop if not k=any(array['text','url','is_active','sort_order','starts_at','ends_at','image_asset_id','style','pages','placement','sponsored','action']) then raise exception 'UNKNOWN_FIELD';end if;end loop;
 if p_patch->>'action'='delete' then delete from public.ticker_items where id=p_id returning * into item;return item;end if;
 if p_id is null then insert into public.ticker_items(text) values(p_patch->>'text') returning * into item;else select * into item from public.ticker_items where id=p_id for update;if not found then raise exception 'NOT_FOUND';end if;end if;
 update public.ticker_items set text=coalesce(p_patch->>'text',text),url=case when p_patch?'url' then nullif(p_patch->>'url','') else url end,is_active=coalesce((p_patch->>'is_active')::boolean,is_active),sort_order=coalesce((p_patch->>'sort_order')::int,sort_order),starts_at=coalesce((p_patch->>'starts_at')::timestamptz,starts_at),ends_at=case when p_patch?'ends_at' then nullif(p_patch->>'ends_at','')::timestamptz else ends_at end,image_asset_id=case when p_patch?'image_asset_id' then nullif(p_patch->>'image_asset_id','')::uuid else image_asset_id end,style=coalesce(p_patch->>'style',style),pages=case when p_patch?'pages' then array(select jsonb_array_elements_text(p_patch->'pages')) else pages end,placement=coalesce(p_patch->>'placement',placement),sponsored=coalesce((p_patch->>'sponsored')::boolean,sponsored) where id=item.id returning * into item;
 if item.image_asset_id is not null then if not exists(select 1 from public.media_assets where id=item.image_asset_id and deleted_at is null) then raise exception 'INVALID_MEDIA';end if;update public.media_assets set visibility='public' where id=item.image_asset_id;end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'ticker_saved','ticker',item.id::text);return item;
end $$;
create or replace function public.cms_publishing_settings(p_value jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_role(array['OWNER','ADMIN']) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if jsonb_typeof(p_value)<>'object' or exists(select 1 from jsonb_object_keys(p_value) k where k not in ('default_comments','comments_close_days','timezone','default_visibility','view_retention_days')) then raise exception 'INVALID_INPUT';end if;
 insert into public.site_settings(key,value,is_public) values('publishing',p_value,false) on conflict(key) do update set value=excluded.value,updated_at=now();
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'publishing_settings_saved','settings','publishing');
end $$;
-- Public-facing writes are server-only. Actor/contact details never come from JWT user_metadata.
create or replace function public.submit_guest_comment(p_post_id uuid,p_parent_id uuid,p_name text,p_email text,p_body text) returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid=gen_random_uuid();parent public.comments;level int=0;
begin
 if length(trim(p_body)) not between 1 and 5000 or length(trim(p_name)) not between 1 and 100 or p_body ~ '(?i)(https?://|<[^>]+>)' then raise exception 'INVALID_COMMENT';end if;
 if not exists(select 1 from public.posts where id=p_post_id and status='published' and visibility='public' and published_at<=now() and deleted_at is null and allow_comments and (comments_close_at is null or comments_close_at>now())) then raise exception 'COMMENTS_CLOSED';end if;
 if p_parent_id is not null then select * into parent from public.comments where id=p_parent_id and post_id=p_post_id and status='approved' and deleted_at is null;if not found or parent.depth>=3 then raise exception 'INVALID_PARENT';end if;level=parent.depth+1;end if;
 insert into public.comments(id,post_id,parent_id,depth,guest_name,body) values(new_id,p_post_id,p_parent_id,level,p_name,p_body);
 insert into private.comment_contacts(comment_id,email) values(new_id,nullif(p_email,''));return new_id;
end $$;
create or replace function public.record_post_view(p_post_id uuid,p_visitor_hash text) returns boolean language plpgsql security definer set search_path='' as $$
declare inserted_id uuid;
begin
 if length(p_visitor_hash)<>64 or not exists(select 1 from public.posts where id=p_post_id and status='published' and visibility='public' and deleted_at is null and published_at<=now()) then return false;end if;
 insert into public.post_views(post_id,visitor_hash) values(p_post_id,p_visitor_hash) on conflict(post_id,visitor_hash,viewed_on) do nothing returning id into inserted_id;
 delete from public.post_views where viewed_on<current_date-30;return inserted_id is not null;
end $$;
create or replace function public.report_comment(p_comment_id uuid,p_reason text,p_visitor_hash text) returns void language plpgsql security definer set search_path='' as $$
begin
 if length(p_reason) not between 3 and 1000 or length(p_visitor_hash)<>64 or not exists(select 1 from public.comments c join public.posts p on p.id=c.post_id where c.id=p_comment_id and c.status='approved' and c.deleted_at is null and p.status='published' and p.visibility='public' and p.deleted_at is null) then raise exception 'INVALID_REPORT';end if;
 insert into public.comment_reports(comment_id,reason,visitor_hash) values(p_comment_id,p_reason,p_visitor_hash) on conflict(comment_id,visitor_hash) do nothing;
end $$;
create or replace function public.public_view_stats(p_days int default 7,p_limit int default 10) returns table(post_id uuid,total_views bigint,period_views bigint) language sql stable security definer set search_path='' as $$ select p.id,count(v.id),count(v.id) filter(where v.viewed_on>=current_date-least(greatest(p_days,1),30)) from public.posts p join public.post_views v on v.post_id=p.id where p.status='published' and p.visibility='public' and p.deleted_at is null and p.published_at<=now() group by p.id order by count(v.id) filter(where v.viewed_on>=current_date-least(greatest(p_days,1),30)) desc,p.id limit least(greatest(p_limit,1),50) $$;
revoke all on function public.public_view_stats(int,int) from public;
grant execute on function public.public_view_stats(int,int) to anon,authenticated,service_role;
-- Daily dedup rows expire, while this retained daily aggregate preserves historical totals.
create table if not exists public.post_view_daily(post_id uuid references public.posts(id) on delete cascade,day date not null,views bigint not null default 0,primary key(post_id,day));
alter table public.post_view_daily enable row level security;
revoke all on public.post_view_daily from anon,authenticated;
grant all on public.post_view_daily to service_role;
grant select on public.post_view_daily to authenticated;
drop policy if exists staff_read on public.post_view_daily;
create policy staff_read on public.post_view_daily for select to authenticated using((select private.has_role(array['OWNER','ADMIN','EDITOR'])));
create or replace function private.aggregate_view() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.post_view_daily(post_id,day,views) values(new.post_id,new.viewed_on,1) on conflict(post_id,day) do update set views=public.post_view_daily.views+1;return new;end $$;
revoke all on function private.aggregate_view() from public,anon,authenticated;
drop trigger if exists aggregate_view on public.post_views;
create trigger aggregate_view after insert on public.post_views for each row execute function private.aggregate_view();
create or replace function public.public_view_stats(p_days int default 7,p_limit int default 10) returns table(post_id uuid,total_views bigint,period_views bigint) language sql stable security definer set search_path='' as $$ select p.id,sum(v.views)::bigint,coalesce(sum(v.views) filter(where v.day>=current_date-least(greatest(p_days,1),30)),0)::bigint from public.posts p join public.post_view_daily v on v.post_id=p.id where p.status='published' and p.visibility='public' and p.deleted_at is null and p.published_at<=now() group by p.id order by coalesce(sum(v.views) filter(where v.day>=current_date-least(greatest(p_days,1),30)),0) desc,p.id limit least(greatest(p_limit,1),50) $$;
revoke all on function public.cms_save_post(uuid,jsonb,bigint) from public,anon;
grant execute on function public.cms_save_post(uuid,jsonb,bigint) to authenticated;
revoke all on function public.cms_transition_post(uuid,text,bigint,timestamptz) from public,anon;
grant execute on function public.cms_transition_post(uuid,text,bigint,timestamptz) to authenticated;
revoke all on function public.cms_restore_revision(uuid,bigint) from public,anon;
grant execute on function public.cms_restore_revision(uuid,bigint) to authenticated;
revoke all on function public.cms_save_category(uuid,jsonb,uuid) from public,anon;
grant execute on function public.cms_save_category(uuid,jsonb,uuid) to authenticated;
revoke all on function public.cms_save_author(uuid,jsonb) from public,anon;
grant execute on function public.cms_save_author(uuid,jsonb) to authenticated;
revoke all on function public.cms_register_media(jsonb) from public,anon;
grant execute on function public.cms_register_media(jsonb) to authenticated;
revoke all on function public.cms_update_media(uuid,jsonb) from public,anon;
grant execute on function public.cms_update_media(uuid,jsonb) to authenticated;
revoke all on function public.cms_moderate_comment(uuid,text) from public,anon;
grant execute on function public.cms_moderate_comment(uuid,text) to authenticated;
revoke all on function public.cms_save_ticker(uuid,jsonb) from public,anon;
grant execute on function public.cms_save_ticker(uuid,jsonb) to authenticated;
revoke all on function public.cms_publishing_settings(jsonb) from public,anon;
grant execute on function public.cms_publishing_settings(jsonb) to authenticated;
revoke all on function public.submit_guest_comment(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_guest_comment(uuid,uuid,text,text,text) to service_role;
revoke all on function public.record_post_view(uuid,text) from public,anon,authenticated;
grant execute on function public.record_post_view(uuid,text) to service_role;
revoke all on function public.report_comment(uuid,text,text) from public,anon,authenticated;
grant execute on function public.report_comment(uuid,text,text) to service_role;
-- The existing editorial bucket now stores private originals/variants, not draft-public URLs.
update storage.buckets set public=false,allowed_mime_types=array['image/jpeg','image/png','image/webp','image/avif','image/gif'] where id='editorial';
drop policy if exists editorial_upload on storage.objects;
create policy editorial_upload on storage.objects for insert to authenticated with check(bucket_id='editorial' and split_part(name,'/',1)=(select auth.uid())::text and (select private.has_role(array['OWNER','ADMIN','EDITOR','AUTHOR'])));
drop policy if exists editorial_read on storage.objects;
create policy editorial_read on storage.objects for select to authenticated using(bucket_id='editorial' and (split_part(name,'/',1)=(select auth.uid())::text or (select private.has_role(array['OWNER','ADMIN','EDITOR']))));
insert into public.site_settings(key,value,is_public) values('publishing','{"default_comments":true,"comments_close_days":30,"timezone":"Asia/Aden","default_visibility":"public","view_retention_days":30}',false) on conflict(key) do nothing;
notify pgrst, 'reload schema';

create or replace function public.run_due_posts() returns integer language sql security definer set search_path='' as $$ select private.publish_due() $$;
revoke all on function public.run_due_posts() from public,anon,authenticated;
grant execute on function public.run_due_posts() to service_role;
create or replace function public.cms_bulk_transition(p_items jsonb,p_action text) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;result public.posts;results jsonb='[]';
begin
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 or p_action not in ('review','archived','unpublished','delete','restore') then raise exception 'INVALID_INPUT';end if;
 for item in select value from jsonb_array_elements(p_items) loop result=public.cms_transition_post((item->>'id')::uuid,p_action,(item->>'version')::bigint);results=results||jsonb_build_array(jsonb_build_object('id',result.id,'version',result.version,'status',result.status));end loop;return results;
end $$;
revoke all on function public.cms_bulk_transition(jsonb,text) from public,anon;
grant execute on function public.cms_bulk_transition(jsonb,text) to authenticated;
drop policy if exists read_redirects on public.slug_redirects;
create policy read_redirects on public.slug_redirects for select to anon,authenticated using((kind='post' and exists(select 1 from public.posts p where p.slug=new_slug)) or (kind='category' and exists(select 1 from public.categories c where c.slug=new_slug)) or (kind='author' and exists(select 1 from public.authors a where a.slug=new_slug)));

-- Public consumers receive only publication fields, never creator IDs or internal errors/revisions.
revoke select on public.posts from anon;
grant select(id,title,slug,subtitle,excerpt,content,content_json,cover_image,cover_asset_id,thumbnail_asset_id,share_asset_id,author_id,primary_category_id,status,visibility,featured,published_at,updated_at,reading_minutes,seo_title,seo_description,canonical_url,tags,sources,allow_comments,deleted_at,search_vector) on public.posts to anon;
create or replace function public.post_view_count(p_post_id uuid) returns bigint language sql stable security definer set search_path='' as $$ select coalesce(sum(v.views),0)::bigint from public.post_view_daily v join public.posts p on p.id=v.post_id where p.id=p_post_id and p.status='published' and p.visibility='public' and p.deleted_at is null and p.published_at<=now() $$;
revoke all on function public.post_view_count(uuid) from public;
grant execute on function public.post_view_count(uuid) to anon,authenticated,service_role;
notify pgrst,'reload schema';
