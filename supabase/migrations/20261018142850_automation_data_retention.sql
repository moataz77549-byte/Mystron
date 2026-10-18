create or replace function public.automation_retention() returns void language plpgsql security definer set search_path='' as $$
begin
 delete from public.telegram_updates where received_at<now()-interval '7 days';delete from private.telegram_states where expires_at<now();delete from private.telegram_link_tokens where expires_at<now()-interval '1 day';
 delete from public.telegram_deliveries where created_at<now()-interval '7 days';delete from public.ai_usage where created_at<now()-interval '90 days';delete from private.ai_summary_cache where expires_at<now();delete from public.automation_jobs where status in ('done','dead') and created_at<now()-interval '30 days';
end $$;
revoke all on function public.automation_retention() from public,anon,authenticated;grant execute on function public.automation_retention() to service_role;
notify pgrst,'reload schema';

