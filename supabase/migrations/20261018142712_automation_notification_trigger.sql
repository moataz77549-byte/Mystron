create or replace function private.telegram_notify() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.automation_jobs(kind,dedupe_key,payload) values('notification','notification:'||new.id,jsonb_build_object('notification_id',new.id)) on conflict do nothing;return new;
end $$;
revoke all on function private.telegram_notify() from public,anon,authenticated;
drop trigger if exists telegram_notify on public.admin_notifications;create trigger telegram_notify after insert on public.admin_notifications for each row execute function private.telegram_notify();
