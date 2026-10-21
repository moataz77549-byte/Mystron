import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  PENDING,
  checkLedger,
  checkDryRun,
  compareSnapshot,
  encryptFile,
  decryptFile,
  storageKey,
  storageHeaders,
  hasOwnerApproval,
} from "./db-release.mjs";

test("Storage supports independently rotatable secret keys without treating them as JWTs", () => {
  assert.throws(() => storageKey({}));
  assert.equal(
    storageKey({
      SUPABASE_STORAGE_KEY: "sb_secret_fixture",
      SUPABASE_SERVICE_ROLE_KEY: "legacy.fixture",
    }),
    "sb_secret_fixture",
  );
  assert.equal(
    storageKey({ SUPABASE_SERVICE_ROLE_KEY: "legacy.fixture" }),
    "legacy.fixture",
  );
  assert.deepEqual(storageHeaders("sb_secret_fixture"), {
    apikey: "sb_secret_fixture",
  });
  assert.deepEqual(storageHeaders("local.jwt.fixture"), {
    apikey: "local.jwt.fixture",
    Authorization: "Bearer local.jwt.fixture",
  });
});

test("production needs recorded owner approval for its own environment", () => {
  const review = {
    state: "approved",
    user: { login: "moataz77549-byte" },
    environments: [{ name: "maystroon-db-backup" }],
  };
  assert.equal(hasOwnerApproval([], "maystroon-db-production"), false);
  assert.equal(hasOwnerApproval([review], "maystroon-db-backup"), true);
  assert.equal(hasOwnerApproval([review], "maystroon-db-production"), false);
  assert.equal(
    hasOwnerApproval([{ ...review, state: "rejected" }], "maystroon-db-backup"),
    false,
  );
  assert.equal(
    hasOwnerApproval(
      [{ ...review, user: { login: "another-reviewer" } }],
      "maystroon-db-backup",
    ),
    false,
  );
});

test("ledger and dry-run reject unrelated, reordered, missing or duplicate migrations", async () => {
  const files = (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const rows = files
    .slice(0, 49)
    .map((f) => ({ version: f.slice(0, 14), name: f.slice(15, -4) }));
  checkLedger(rows, files, 49);
  assert.throws(() => checkLedger(rows.slice(1), files, 49));
  assert.throws(() => checkLedger([...rows].reverse(), files, 49));
  checkDryRun(PENDING.join("\n"));
  for (const names of [
    PENDING.slice(1),
    [...PENDING].reverse(),
    [...PENDING, PENDING[0]],
    [...PENDING, "20261099999999_unknown.sql"],
  ])
    assert.throws(() => checkDryRun(names.join("\n")));
});
test("retention checks preserve duplicate rows and allow only reviewed additive seed rows", () => {
  const table = {
    table_schema: "public",
    table_name: "posts",
    columns: ["id"],
    hashes: ["a", "a"],
  };
  compareSnapshot([table], [{ ...table }]);
  assert.throws(() => compareSnapshot([table], [{ ...table, hashes: ["a"] }]));
  assert.throws(() =>
    compareSnapshot([table], [{ ...table, hashes: ["a", "a", "b"] }], true),
  );
  const permissions = { ...table, table_name: "role_permissions" };
  compareSnapshot(
    [permissions],
    [{ ...permissions, hashes: ["a", "a", "b"] }],
    true,
  );
  assert.throws(() =>
    compareSnapshot([permissions], [{ ...permissions, hashes: ["b"] }], true),
  );
});
test("encrypted backup round-trips and rejects a damaged archive or wrong key", async () => {
  const dir = await mkdtemp(join(tmpdir(), "maystroon-crypto-"));
  try {
    const input = join(dir, "input"),
      encrypted = join(dir, "encrypted"),
      output = join(dir, "output");
    const original = randomBytes(100000),
      key = randomBytes(32);
    await writeFile(input, original);
    const metadata = await encryptFile(input, encrypted, key);
    assert.notDeepEqual(await readFile(encrypted), original);
    await decryptFile(encrypted, output, key, metadata);
    assert.deepEqual(await readFile(output), original);
    await assert.rejects(
      decryptFile(encrypted, output, randomBytes(32), metadata),
    );
    const damaged = await readFile(encrypted);
    damaged[100] ^= 1;
    await writeFile(encrypted, damaged);
    await assert.rejects(decryptFile(encrypted, output, key, metadata));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
