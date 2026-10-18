-- Notifications contain generic titles and scoped links, never content or secrets.
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
 insert into public.admin_notifications(user_id,kind,title,href,priority) values(recipient.user_id,tg_table_name,heading,link,case when tg_table_name='publishing_runs' then 'high' else 'normal' end);end if;end loop;return new;
end $$;
revoke all on function private.control_notify() from public,anon,authenticated;
drop trigger if exists control_notify on public.posts;create trigger control_notify after insert or update of status on public.posts for each row execute function private.control_notify();
drop trigger if exists control_notify on public.comments;create trigger control_notify after insert on public.comments for each row execute function private.control_notify();
drop trigger if exists control_notify on public.publishing_runs;create trigger control_notify after insert on public.publishing_runs for each row execute function private.control_notify();
insert into public.integration_settings(id) values('supabase'),('vercel'),('telegram'),('botkeep'),('ai'),('analytics') on conflict do nothing;
notify pgrst,'reload schema';
