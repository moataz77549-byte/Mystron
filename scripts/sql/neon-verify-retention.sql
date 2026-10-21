-- TEST ONLY. Baseline fingerprints use the original columns, excluding new ones.
do $test$
declare t record; hashes text[]; cols text; extra_allowed boolean;
begin
 for t in select * from maystroon_test_harness.baseline_rows loop
  select string_agg(format('%I',name),',' order by position) into cols from unnest(t.column_names) with ordinality columns(name,position);
  execute format('select coalesce(array_agg(h order by h),ARRAY[]::text[]) from (select md5(row_to_json(r)::text) h from (select %s from %I.%I) r) x',cols,t.schema_name,t.table_name) into hashes;
  extra_allowed=t.schema_name='public' and t.table_name in ('role_permissions','admin_memberships');
  if not extra_allowed and hashes is distinct from t.row_hashes then
   raise exception 'Original rows changed in %.%',t.schema_name,t.table_name;
  end if;
  if exists(select 1 from (select h,count(*) n from unnest(t.row_hashes) h group by h) old_rows left join (select h,count(*) n from unnest(hashes) h group by h) new_rows using(h) where coalesce(new_rows.n,0)<old_rows.n) then
   raise exception 'Original row multiplicity lost in %.%',t.schema_name,t.table_name;
  end if;
 end loop;
 if (select count(*) from maystroon_test_harness.migration_runs)<>55 then raise exception 'Expected 55 test records';end if;
 if exists(select 1 from maystroon_test_harness.migration_runs where phase='pending' and cardinality(provider_omissions)<>0) then raise exception 'Pending application SQL was omitted';end if;
 if exists(select 1 from pg_tables where schemaname in ('public','private') and not rowsecurity) then raise exception 'RLS missing';end if;
end $test$;
