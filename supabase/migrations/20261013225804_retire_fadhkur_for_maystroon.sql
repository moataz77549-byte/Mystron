-- Audit ledger for the one-time destructive teardown on the repurposed project.
-- The reviewed SQL is supabase/operations/retire_fadhkur.sql and was applied remotely
-- before foundation. It is deliberately NOT replayed by ordinary db push/reset.
-- A fresh installation has no legacy project content to retire.
select 1;
