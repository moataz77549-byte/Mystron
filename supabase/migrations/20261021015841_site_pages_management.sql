-- Static content has independent site settings authority, never author privileges.
create table public.site_pages(
 id uuid primary key default gen_random_uuid(),
 slug text unique not null check(length(slug) between 1 and 120 and slug !~ '[/[:space:].]'),
 title text not null check(length(trim(title)) between 1 and 200),
 description text not null default '' check(length(description)<=500),
 content_json jsonb not null check(jsonb_typeof(content_json)='object' and coalesce(content_json->>'type'='doc',false) and octet_length(content_json::text)<=800000),
 is_published boolean not null default false,
 version bigint not null default 1,
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now()
);
create index site_pages_updated_idx on public.site_pages(updated_at desc,id);
alter table public.site_pages enable row level security;
create policy published_pages on public.site_pages for select to anon,authenticated using(is_published);
create policy admin_pages on public.site_pages for select to authenticated using((select private.has_permission('settings.read')));
grant select(id,slug,title,description,content_json,is_published,version,updated_at) on public.site_pages to anon,authenticated;
revoke insert,update,delete on public.site_pages from anon,authenticated;
create or replace function public.cms_save_page(p_id uuid,p_patch jsonb,p_expected_version bigint default null) returns public.site_pages language plpgsql security definer set search_path='' as $$
declare item public.site_pages;k text;
begin
 perform private.require_permission('settings.update');
 if jsonb_typeof(p_patch)<>'object' or not(p_patch ?& array['slug','title','description','content_json','is_published']) or jsonb_typeof(p_patch->'is_published')<>'boolean' then raise exception 'INVALID_INPUT';end if;
 for k in select jsonb_object_keys(p_patch) loop if not k=any(array['slug','title','description','content_json','is_published']) then raise exception 'INVALID_INPUT';end if;end loop;
 if p_patch->>'slug' !~ '^[[:alnum:]_-]+$' then raise exception 'INVALID_INPUT';end if;
 if p_id is null then
 if p_expected_version is not null then raise exception 'VERSION_CONFLICT';end if;
 insert into public.site_pages(slug,title,description,content_json,is_published,updated_by) values(p_patch->>'slug',p_patch->>'title',p_patch->>'description',p_patch->'content_json',(p_patch->>'is_published')::boolean,auth.uid()) returning * into item;
 else
 select * into item from public.site_pages where id=p_id for update;
 if not found then raise exception 'NOT_FOUND';end if;
 if p_expected_version is null or item.version<>p_expected_version then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;
 -- Paths stay stable; deliberate replacement uses the same page record.
 if item.slug<>p_patch->>'slug' then raise exception 'SLUG_RESERVED';end if;
 update public.site_pages set title=p_patch->>'title',description=p_patch->>'description',content_json=p_patch->'content_json',is_published=(p_patch->>'is_published')::boolean,version=version+1,updated_at=now(),updated_by=auth.uid() where id=p_id returning * into item;
 end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'PAGE_SAVED','page',item.id::text,jsonb_build_object('version',item.version,'published',item.is_published));
 return item;
end $$;
revoke all on function public.cms_save_page(uuid,jsonb,bigint) from public,anon;
grant execute on function public.cms_save_page(uuid,jsonb,bigint) to authenticated;
