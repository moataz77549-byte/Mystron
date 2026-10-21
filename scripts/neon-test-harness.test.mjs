import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitPostgresSql,
  migrationBatch,
  acceptanceBatch,
} from "./neon-test-harness.mjs";

test("SQL transport splitter preserves function bodies, strings and nested comments", () => {
  assert.deepEqual(
    splitPostgresSql(
      "select ';'; select 'a'';b'; do $body$ begin perform 1; end $body$; /* outer ; /* nested ; */ */ select 3;",
    ),
    [
      "select ';'",
      "select 'a'';b'",
      "do $body$ begin perform 1; end $body$",
      "/* outer ; /* nested ; */ */ select 3",
    ],
  );
  assert.deepEqual(splitPostgresSql("select E'a\\';b'; -- trailing comment"), [
    "select E'a\\';b'",
  ]);
  assert.throws(() => splitPostgresSql("do $$ begin perform 1;"));
  assert.throws(() => splitPostgresSql("select 'broken"));
});

test("real SQL acceptance runs in a savepoint and rolls its fixtures back", async () => {
  const batch = await acceptanceBatch();
  assert.equal(batch.sql_statements[0], "savepoint cms_acceptance");
  assert.deepEqual(batch.sql_statements.slice(-2), [
    "rollback to savepoint cms_acceptance",
    "release savepoint cms_acceptance",
  ]);
  assert.ok(
    batch.sql_statements.some((s) => s.includes("public.cms_transition_post")),
  );
  assert.ok(
    batch.sql_statements.every((s) => !s.includes("\\set ON_ERROR_STOP")),
  );
});

test("Neon permits one documented baseline provider omission and no pending omissions", async () => {
  const baseline = await migrationBatch(0, 49),
    pending = await migrationBatch(49, 55);
  assert.equal(baseline.evidence.filter((e) => e.omitted.length).length, 1);
  assert.equal(
    baseline.evidence.find((e) => e.omitted.length).filename,
    "20261013230449_configure_public_data_api.sql",
  );
  assert.equal(pending.evidence.length, 6);
  assert.ok(pending.evidence.every((e) => e.omitted.length === 0));
  assert.equal(pending.database_name, "maystroon_test");
  assert.equal(pending.branch_id, "br-autumn-hat-am7i09m0");
});
