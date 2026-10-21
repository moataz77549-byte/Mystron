-- TEST ONLY: run after the 49 baseline files, before the six pending files.
do $$ begin
 if current_database()<>'maystroon_test' or (select count(*) from maystroon_test_harness.migration_runs)<>49 then raise exception 'Wrong test baseline';end if;
end $$;
insert into public.posts(id,title,slug,content) values('d0000000-0000-4000-8000-000000000001','مسودة اختبار الاحتفاظ قبل الترحيلات','neon-retention-fixture','نص اختباري معزول');
create table maystroon_test_harness.baseline_rows(schema_name text,table_name text,column_names text[],row_hashes text[],primary key(schema_name,table_name));
do $test$ declare t record; names text[]; hashes text[]; cols text; begin
 for t in select schemaname,tablename from pg_tables where schemaname in ('public','private','auth','storage') loop
  select array_agg(column_name::text order by ordinal_position),string_agg(format('%I',column_name),',' order by ordinal_position) into names,cols from information_schema.columns where table_schema=t.schemaname and table_name=t.tablename;
  execute format('select coalesce(array_agg(h order by h),ARRAY[]::text[]) from (select md5(row_to_json(r)::text) h from (select %s from %I.%I) r) x',cols,t.schemaname,t.tablename) into hashes;
  insert into maystroon_test_harness.baseline_rows values(t.schemaname,t.tablename,names,hashes);
 end loop;
end $test$;
