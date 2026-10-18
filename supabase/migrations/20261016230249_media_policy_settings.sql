insert into public.site_settings(key,value,is_public) values('media','{"max_upload_bytes":5242880,"allow_gif":true,"webp_quality":82}',false) on conflict(key) do nothing;
create or replace function public.media_policy_server() returns jsonb language sql stable security definer set search_path='' as $$ select value from public.site_settings where key='media' $$;
revoke all on function public.media_policy_server() from public,anon,authenticated;grant execute on function public.media_policy_server() to service_role;
