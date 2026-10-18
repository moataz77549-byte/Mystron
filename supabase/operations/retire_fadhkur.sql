-- ONE-TIME destructive operation authorized by the project owner.
-- Target: ttvasynaxkkcwrmvlorg (formerly Fadhkur). NEVER run as a normal migration.
-- The original app marker is required; aborts on an already repurposed database.
do $$
declare job record;
begin
 if to_regclass('app.stations') is null then raise exception 'Original Fadhkur marker absent; aborting'; end if;
 if exists(select 1 from auth.users) then raise exception 'Auth users appeared since preflight; aborting'; end if;
 if exists(select 1 from storage.objects) then raise exception 'Storage objects appeared since preflight; use Storage API before retrying'; end if;
 for job in select jobid from cron.job loop perform cron.unschedule(job.jobid); end loop;
end $$;
drop schema if exists app cascade;
drop schema if exists radio cascade;
drop schema if exists private cascade;
drop schema if exists api cascade;
-- Keep Supabase-managed schemas and extension-owned objects intact.
do $$
declare object record;
begin
 for object in select c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S') and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e') loop
  if to_regclass(format('public.%I',object.relname)) is not null then
   execute format('drop %s public.%I cascade',case object.relkind when 'v' then 'view' when 'm' then 'materialized view' when 'S' then 'sequence' else 'table' end,object.relname);
  end if;
 end loop;
 for object in select p.proname,p.prokind,pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e') loop
  execute format('drop %s if exists public.%I(%s) cascade',case when object.prokind='p' then 'procedure' else 'function' end,object.proname,object.args);
 end loop;
 for object in select t.typname,t.typtype from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype in ('e','d') and not exists(select 1 from pg_depend d where d.classid='pg_type'::regclass and d.objid=t.oid and d.deptype='e') loop
  execute format('drop %s if exists public.%I cascade',case object.typtype when 'd' then 'domain' else 'type' end,object.typname);
 end loop;
end $$;
-- Old empty bucket records must be deleted through Storage API.
-- Supabase protects direct SQL deletion; no managed trigger is bypassed.
-- Reset old project's migration history; subsequent MAYSTROON migrations are recorded anew.
delete from supabase_migrations.schema_migrations;
