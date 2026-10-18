-- PostgreSQL Cron uses the same idempotent publishing engine as the protected HTTP fallback.
-- Supabase supports pg_cron here. Other environments without it deliberately skip activation.
create or replace function private.cleanup_editorial_retention() returns void language plpgsql security definer set search_path='' as $$
begin
 delete from public.post_views where viewed_on<current_date-30;
 delete from public.comment_reports where created_at<now()-interval '30 days';
 delete from private.comment_contacts where comment_id in(select id from public.comments where created_at<now()-interval '90 days');
end $$;
revoke all on function private.cleanup_editorial_retention() from public,anon,authenticated,service_role;
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
 perform cron.schedule('maystroon-publish-due','* * * * *','select private.publish_due();');
 perform cron.schedule('maystroon-retention','17 1 * * *','select private.cleanup_editorial_retention();');
 end if;
end $$;
