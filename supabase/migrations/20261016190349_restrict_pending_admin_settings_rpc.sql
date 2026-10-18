-- Least-privilege safety while remaining control-center migrations are pending.
revoke all on function public.admin_update_setting(text,jsonb,bigint) from public,anon;
grant execute on function public.admin_update_setting(text,jsonb,bigint) to authenticated;
revoke all on function public.owner_setup_state() from public,anon;
grant execute on function public.owner_setup_state() to authenticated;
