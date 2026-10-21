-- LOCAL DOCKER ONLY. The caller uses a transaction; roll back every test row.
\set ON_ERROR_STOP on
do $$ begin
 if exists(select 1 from pg_tables where schemaname='public' and not rowsecurity) then raise exception 'RLS missing';end if;
 if has_function_privilege('anon','public.cms_save_page(uuid,jsonb,bigint)','execute') then raise exception 'Anonymous page write exposed';end if;
 if has_function_privilege('anon','public.cms_merge_tag(text,text,integer)','execute') then raise exception 'Anonymous tag write exposed';end if;
 if has_table_privilege('authenticated','public.site_pages','insert') then raise exception 'Direct page write exposed';end if;
 if has_column_privilege('anon','public.site_pages','updated_by','select') then raise exception 'Page administrative identity exposed';end if;
end $$;
insert into auth.users(id,email,email_confirmed_at) values('a0000000-0000-4000-8000-000000000001','release-local@example.test',now());
insert into auth.sessions(id,user_id,aal,created_at,updated_at) values('a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','aal1',now(),now());
insert into public.admin_memberships(user_id) values('a0000000-0000-4000-8000-000000000001');
insert into public.user_permissions(user_id,permission_key,effect,scope)
select 'a0000000-0000-4000-8000-000000000001',key,'allow','all' from public.permissions
where key in ('posts.create','posts.read','posts.update','posts.publish','posts.schedule','posts.delete','authors.manage','categories.manage','settings.read','settings.update','comments.moderate');
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','a0000000-0000-4000-8000-000000000001','session_id','a0000000-0000-4000-8000-000000000002','iat',extract(epoch from now())::bigint,'role','authenticated')::text,true);
set local role authenticated;
do $$ declare a public.authors;c public.categories;p public.posts;page public.site_pages;v bigint; begin
 if not (public.admin_identity()->>'active')::boolean then raise exception 'Local session inactive';end if;
 a=public.cms_save_author(null,'{"display_name":"كاتب التحقق","slug":"release-local-author","specialty":"أدب"}');
 c=public.cms_save_category(null,'{"name":"قسم التحقق","slug":"release-local-category","color":"#267E81"}');
 if a.specialty<>'أدب' or c.color<>'#267E81' then raise exception 'Catalog metadata missing';end if;
 p=public.cms_save_post(null,jsonb_build_object('title','مقال التحقق المحلي','slug','release-local-post','content','نص عربي للتحقق من النشر','content_json','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"نص عربي للتحقق من النشر"}]}]}'::jsonb,'author_id',a.id,'primary_category_id',c.id,'category_ids',jsonb_build_array(c.id),'tags',jsonb_build_array('release-old')));
 v=p.version;
 p=public.cms_save_post(p.id,'{"subtitle":"حفظ ثان"}',p.version);
 begin perform public.cms_save_post(p.id,'{"title":"كتابة قديمة"}',v);raise exception 'Conflict accepted';exception when serialization_failure then null;end;
 perform public.cms_merge_tag('release-old','release-new',1);
 select * into p from public.posts where id=p.id;
 if not 'release-new'=any(p.tags) then raise exception 'Tag merge failed';end if;
 p=public.cms_transition_post(p.id,'review',p.version);
 p=public.cms_transition_post(p.id,'approve',p.version);
 if p.approved_version is distinct from p.version then raise exception 'Approval lost';end if;
 p=public.cms_transition_post(p.id,'publish',p.version);
 if p.status<>'published' then raise exception 'Publish failed';end if;
 p=public.cms_transition_post(p.id,'unpublished',p.version);
 p=public.cms_transition_post(p.id,'scheduled',p.version,now()+interval '1 day');
 if p.status<>'scheduled' then raise exception 'Schedule failed';end if;
 p=public.cms_transition_post(p.id,'draft',p.version);
 if p.scheduled_at is not null then raise exception 'Schedule cancellation failed';end if;
 page=public.cms_save_page(null,'{"slug":"release-local-page","title":"صفحة التحقق","description":"وصف","content_json":{"type":"doc","content":[]},"is_published":false}');
 page=public.cms_save_page(page.id,'{"slug":"release-local-page","title":"صفحة منشورة","description":"وصف","content_json":{"type":"doc","content":[]},"is_published":true}',page.version);
 if not page.is_published or page.version<>2 then raise exception 'Page save failed';end if;
 if (public.admin_my_sessions()->>'total')::int<>1 then raise exception 'Session list failed';end if;
end $$;
reset role;
insert into public.comments(id,post_id,body,status) select 'b0000000-0000-4000-8000-000000000001',id,'تعليق تحقق البلاغات','approved' from public.posts where slug='release-local-post';
insert into public.comment_reports(id,comment_id,reason,visitor_hash) values('b0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001','بلاغ تحقق محلي',repeat('a',64));
set local role authenticated;
do $$ begin
 perform public.cms_resolve_report('b0000000-0000-4000-8000-000000000002','hidden');
 if not exists(select 1 from jsonb_array_elements(public.admin_report_list(1,'resolved')->'rows') r where r->>'id'='b0000000-0000-4000-8000-000000000002' and r->>'resolution'='hidden' and r->>'comment_status'='hidden') then raise exception 'Report moderation failed';end if;
end $$;
reset role;
update auth.sessions set not_after=now()-interval '1 second' where id='a0000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin if (public.admin_identity()->>'active')::boolean then raise exception 'Expired session accepted';end if;end $$;
reset role;
update auth.sessions set not_after=null where id='a0000000-0000-4000-8000-000000000002';
update public.admin_memberships set enabled=false where user_id='a0000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 if (public.admin_identity()->>'active')::boolean then raise exception 'Disabled session accepted';end if;
 begin perform public.cms_save_post(null,'{"title":"غير مصرح"}');raise exception 'Unauthorized write accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
