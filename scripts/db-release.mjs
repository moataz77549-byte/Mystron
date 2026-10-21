// Production access is confined to backup/read checks and the explicitly gated CLI push.
import { spawnSync } from "node:child_process";
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  copyFile,
  rm,
  stat,
} from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

export const PROJECT = "ttvasynaxkkcwrmvlorg";
export const BRANCH = "refs/heads/fix-admin-editorial-publishing-overhaul";
export const BUCKET = "maystroon-private-release-backups";
export const PENDING = [
  "20261020211511_editorial_tag_management.sql",
  "20261020211520_comment_report_workflow.sql",
  "20261021014512_editorial_catalog_metadata.sql",
  "20261021014741_self_service_admin_sessions.sql",
  "20261021015741_editorial_approval_decision.sql",
  "20261021015841_site_pages_management.sql",
];
const root = resolve(import.meta.dirname, "..");
const cli = join(root, "node_modules/.bin/supabase");
const scratch = resolve(
  process.env.RUNNER_TEMP || "/tmp",
  "maystroon-db-release",
);
const local = join(scratch, "local");
const backup = join(scratch, "backup");
const container = "supabase_db_MaystroonRelease";
const network = "maystroon-release-isolated";
const subnet = "172.29.0.0/24";
const firewall = [
  "DOCKER-USER",
  "-s",
  subnet,
  "!",
  "-d",
  subnet,
  "-m",
  "conntrack",
  "--ctstate",
  "NEW",
  "-j",
  "REJECT",
];
const ident = (s) => '"' + s.replaceAll('"', '""') + '"';
const literal = (s) => "'" + s.replaceAll("'", "''") + "'";
const digest = (s) => createHash("sha256").update(s).digest("hex");
class ReleaseError extends Error {}
const assert = (value, message) => {
  if (!value) throw new ReleaseError(message);
};

// Never echo child output on failure: it may contain connection strings or row values.
function run(command, args, options = {}) {
  const { mergeOutput = false, ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    ...spawnOptions,
  });
  if (result.status !== 0) {
    // This mode has no production credentials or restored production data.
    // Keep generated local credentials out of the diagnostic excerpt too.
    if (process.argv[2] === "local")
      console.error(
        (result.stderr || "")
          .replace(/eyJ[A-Za-z0-9_.-]+/g, "[local JWT omitted]")
          .replace(/postgres(?:ql)?:\/\/\S+/g, "[local database URL omitted]")
          .replace(
            /((?:password|secret|token|key)\s*[:=]\s*)\S+/gi,
            "$1[omitted]",
          )
          .slice(-12000),
      );
    throw new ReleaseError(
      `Command failed: ${command === cli ? "supabase " + args.slice(0, 2).join(" ") : command}; diagnostics withheld to protect backup data`,
    );
  }
  return mergeOutput ? result.stdout + "\n" + result.stderr : result.stdout;
}
const supa = (...args) => run(cli, args);
const dryRun = (...args) =>
  run(cli, ["db", "push", ...args, "--dry-run", "--skip-vault"], {
    mergeOutput: true,
  });
async function jsonFile(path, data) {
  await writeFile(path, JSON.stringify(data), { mode: 0o600 });
}
async function files() {
  return (await readdir(join(root, "supabase/migrations")))
    .filter((f) => f.endsWith(".sql"))
    .sort();
}
function migration(f) {
  return { version: f.slice(0, 14), name: f.slice(15, -4) };
}
export function checkLedger(rows, names, count) {
  assert(
    rows.length === count && names.length === 55,
    "Unexpected migration count",
  );
  const expected = names.slice(0, count).map(migration);
  assert(
    JSON.stringify(rows.map(({ version, name }) => ({ version, name }))) ===
      JSON.stringify(expected),
    "Migration ledger differs from reviewed files",
  );
  assert(
    JSON.stringify(names.slice(49)) === JSON.stringify(PENDING),
    "Pending migration allowlist differs",
  );
}
export function checkDryRun(output) {
  const found = [...output.matchAll(/\b\d{14}_[a-z0-9_]+\.sql\b/g)].map(
    (m) => m[0],
  );
  assert(
    JSON.stringify(found) === JSON.stringify(PENDING),
    "Dry-run must list precisely the six approved files once and in order",
  );
}
async function request(url, { key, body, method = "GET", headers = {} } = {}) {
  const response = await fetch(url, {
    method,
    redirect: "error",
    headers: {
      ...(key ? { apikey: key, Authorization: `Bearer ${key}` } : {}),
      ...headers,
    },
    body,
    signal: AbortSignal.timeout(120000),
  });
  assert(
    response.ok,
    `Remote request failed (${response.status}); details withheld`,
  );
  return response;
}
async function remoteQuery(sql) {
  // CLI's Management API transport; every caller supplies SELECT only.
  assert(/^select\b/i.test(sql.trim()), "Remote SQL must be read-only");
  const response = await request(
    `https://api.supabase.com/v1/projects/${PROJECT}/database/query`,
    {
      key: process.env.SUPABASE_ACCESS_TOKEN,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql, read_only: true }),
    },
  );
  return response.json();
}
function localQuery(sql) {
  const text = run("docker", [
    "exec",
    "-i",
    container,
    "psql",
    "-X",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-c",
    `select coalesce(json_agg(t),'[]'::json) from (${sql}) t`,
  ]);
  return JSON.parse(text);
}
const ledgerSQL =
  "select version,name from supabase_migrations.schema_migrations order by version";
async function snapshot(query, shape) {
  const tables =
    shape ||
    (await query(
      "select table_schema,table_name,array_agg(column_name order by ordinal_position) columns from information_schema.columns where table_schema in ('public','private','auth','storage','cron') and not (table_schema='auth' and table_name='schema_migrations') and not (table_schema='storage' and table_name='migrations') and not (table_schema='cron' and table_name='job_run_details') and (table_schema,table_name) in (select schemaname,tablename from pg_tables) group by table_schema,table_name order by table_schema,table_name",
    ));
  const result = [];
  for (const t of tables) {
    // Backup bytes are retained separately, not recursively included in later backups.
    const filter =
      t.table_schema === "storage" &&
      (t.table_name === "buckets" || t.columns.includes("bucket_id"))
        ? ` where ${t.table_name === "buckets" ? "id" : "bucket_id"} <> ${literal(BUCKET)}`
        : "";
    const rows = await query(
      `select coalesce(json_agg(hash order by hash),'[]'::json) hashes,count(*)::int count from (select md5(row_to_json(t)::text) hash from (select ${t.columns.map(ident).join(",")} from ${ident(t.table_schema)}.${ident(t.table_name)}${filter}) t) hashed`,
    );
    assert(
      rows[0].hashes.length === rows[0].count,
      "Incomplete row fingerprint inventory",
    );
    result.push({ ...t, hashes: rows[0].hashes });
  }
  return result;
}
export function compareSnapshot(before, after, additive = false) {
  assert(before.length === after.length, "Snapshot table coverage changed");
  for (let i = 0; i < before.length; i++) {
    const a = before[i],
      b = after[i];
    assert(
      a.table_schema === b.table_schema && a.table_name === b.table_name,
      "Snapshot identity mismatch",
    );
    const canAdd =
      additive &&
      a.table_schema === "public" &&
      ["role_permissions", "admin_memberships"].includes(a.table_name);
    const remaining = [...b.hashes];
    for (const h of a.hashes) {
      const at = remaining.indexOf(h);
      assert(at >= 0, "Existing row changed or disappeared");
      remaining.splice(at, 1);
    }
    assert(canAdd || remaining.length === 0, "Unexpected data change");
  }
}
async function storage(url, key, path, options = {}) {
  return request(`${url}/storage/v1/${path}`, { key, ...options });
}
const objectPath = (bucket, name) =>
  encodeURIComponent(bucket) +
  "/" +
  name.split("/").map(encodeURIComponent).join("/");
async function inventoryStorage(
  directory,
  url = `https://${PROJECT}.supabase.co`,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY,
) {
  const buckets = (await (await storage(url, key, "bucket")).json()).filter(
    (b) => b.id !== BUCKET,
  );
  const objects = [];
  async function walk(bucket, prefix = "") {
    for (let offset = 0; ; offset += 100) {
      const list = await (
        await storage(url, key, `object/list/${encodeURIComponent(bucket)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prefix,
            limit: 100,
            offset,
            sortBy: { column: "name", order: "asc" },
          }),
        })
      ).json();
      for (const item of list) {
        const name = prefix ? `${prefix}/${item.name}` : item.name;
        if (!item.id) {
          await walk(bucket, name);
          continue;
        }
        const file = `${objects.length}.bin`;
        const response = await storage(
          url,
          key,
          `object/${objectPath(bucket, name)}`,
        );
        await pipeline(
          response.body,
          createWriteStream(join(directory, file), { mode: 0o600 }),
        );
        objects.push({
          bucket,
          name,
          file,
          sha256: digest(await readFile(join(directory, file))),
          type: item.metadata?.mimetype || "application/octet-stream",
        });
      }
      if (list.length < 100) break;
    }
  }
  for (const b of buckets) await walk(b.id);
  return { buckets, objects };
}
function encryptionKey() {
  const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY || "", "base64");
  assert(
    key.length === 32,
    "BACKUP_ENCRYPTION_KEY must encode 32 random bytes",
  );
  return key;
}
export async function encryptFile(input, output, key) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  await pipeline(
    createReadStream(input),
    cipher,
    createWriteStream(output, { mode: 0o600 }),
  );
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}
export async function decryptFile(input, output, key, metadata) {
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(metadata.iv, "base64"),
  );
  cipher.setAuthTag(Buffer.from(metadata.tag, "base64"));
  await pipeline(
    createReadStream(input),
    cipher,
    createWriteStream(output, { mode: 0o600 }),
  );
}
async function uploadArchive() {
  run("tar", ["-czf", join(scratch, "backup.tgz"), "-C", backup, "."]);
  const encrypted = join(scratch, "backup.aes");
  const crypto = await encryptFile(
    join(scratch, "backup.tgz"),
    encrypted,
    encryptionKey(),
  );
  const url = `https://${PROJECT}.supabase.co`,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let buckets = await (await storage(url, key, "bucket")).json();
  if (!buckets.some((b) => b.id === BUCKET)) {
    await storage(url, key, "bucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: BUCKET,
        name: BUCKET,
        public: false,
        file_size_limit: 20 * 1024 * 1024,
        allowed_mime_types: ["application/octet-stream", "application/json"],
      }),
    });
    buckets = await (await storage(url, key, "bucket")).json();
  }
  assert(
    buckets.find((b) => b.id === BUCKET)?.public === false,
    "Backup bucket must be private",
  );
  const prefix = `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}/${process.env.GITHUB_SHA}`;
  const parts = [];
  for await (const part of createReadStream(encrypted, {
    highWaterMark: 16 * 1024 * 1024,
  })) {
    const name = `${prefix}/${parts.length}.aes`;
    await storage(url, key, `object/${objectPath(BUCKET, name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: part,
    });
    parts.push({ name, sha256: digest(part) });
  }
  const manifest = {
    ...crypto,
    parts,
    sha: process.env.GITHUB_SHA,
    project: PROJECT,
    created: Date.now(),
  };
  const manifestBytes = JSON.stringify(manifest);
  await storage(
    url,
    key,
    `object/${objectPath(BUCKET, `${prefix}/manifest.json`)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: manifestBytes,
    },
  );
  const attestation = digest(manifestBytes);
  await writeFile(
    process.env.GITHUB_OUTPUT,
    `backup_prefix=${prefix}\nbackup_digest=${attestation}\n`,
    { flag: "a" },
  );
  return { prefix, attestation };
}
async function downloadArchive(prefix, attestation) {
  assert(/^\d+-\d+\/[a-f0-9]{40}$/.test(prefix), "Invalid backup identity");
  const url = `https://${PROJECT}.supabase.co`,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bytes = await (
    await storage(
      url,
      key,
      `object/${objectPath(BUCKET, `${prefix}/manifest.json`)}`,
    )
  ).text();
  assert(digest(bytes) === attestation, "Backup manifest changed");
  const manifest = JSON.parse(bytes);
  assert(
    manifest.sha === process.env.GITHUB_SHA &&
      manifest.project === PROJECT &&
      Date.now() - manifest.created < 24 * 3600000,
    "Backup is stale or belongs to another revision",
  );
  const encrypted = join(scratch, "download.aes");
  await writeFile(encrypted, "", { mode: 0o600 });
  for (let i = 0; i < manifest.parts.length; i++) {
    const p = manifest.parts[i];
    assert(p.name === `${prefix}/${i}.aes`, "Invalid backup part");
    const part = Buffer.from(
      await (
        await storage(url, key, `object/${objectPath(BUCKET, p.name)}`)
      ).arrayBuffer(),
    );
    assert(digest(part) === p.sha256, "Backup part checksum mismatch");
    await writeFile(encrypted, part, { flag: "a" });
  }
  await decryptFile(
    encrypted,
    join(scratch, "download.tgz"),
    encryptionKey(),
    manifest,
  );
  await rm(backup, { recursive: true, force: true });
  await mkdir(backup, { recursive: true, mode: 0o700 });
  run("tar", ["-xzf", join(scratch, "download.tgz"), "-C", backup]);
}
async function approval(environment) {
  assert(
    process.env.GITHUB_REF === BRANCH &&
      process.env.GITHUB_REPOSITORY === "moataz77549-byte/Mystron",
    "Release branch/repository mismatch",
  );
  assert(
    process.env.REVIEWED_SHA === process.env.GITHUB_SHA,
    "Exact revision must be armed explicitly",
  );
  const response = await request(
    `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}/approvals`,
    {
      key: process.env.GH_TOKEN,
      headers: { Accept: "application/vnd.github+json" },
    },
  );
  const reviews = await response.json();
  assert(
    reviews.some(
      (r) =>
        r.state === "approved" &&
        r.environments.some((e) => e.name === environment),
    ),
    "Manual environment approval is required (an unprotected environment is insufficient)",
  );
  const github = async (path) =>
    (
      await request(
        `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${path}`,
        { key: process.env.GH_TOKEN },
      )
    ).json();
  const branch = await github(
    "branches/fix-admin-editorial-publishing-overhaul",
  );
  assert(
    branch.commit.sha === process.env.GITHUB_SHA,
    "Release revision is no longer the branch head",
  );
  if (environment === "maystroon-db-production") {
    const runs = await github(
      `actions/runs?head_sha=${process.env.GITHUB_SHA}&per_page=100`,
    );
    assert(
      runs.workflow_runs.some(
        (r) =>
          r.path === ".github/workflows/ci.yml" &&
          r.head_sha === process.env.GITHUB_SHA &&
          r.status === "completed" &&
          r.conclusion === "success",
      ),
      "MAYSTROON CI must succeed for this exact revision before production",
    );
  }
}
async function prepareLocal(empty = false) {
  console.log("Starting isolated local Supabase (no production writes).");
  await mkdir(join(local, "supabase/migrations"), {
    recursive: true,
    mode: 0o700,
  });
  const config = (
    await readFile(join(root, "supabase/config.toml"), "utf8")
  ).replace('project_id = "Maystroon"', 'project_id = "MaystroonRelease"');
  await writeFile(join(local, "supabase/config.toml"), config);
  if (!empty)
    for (const f of (await files()).slice(0, 49))
      await copyFile(
        join(root, "supabase/migrations", f),
        join(local, "supabase/migrations", f),
      );
  // Docker's internal gateway mode does not expose the host ports that CLI's
  // health checks require. A dedicated bridge plus a fail-closed egress rule
  // preserves localhost health/API access while blocking new outbound flows.
  run("docker", [
    "network",
    "create",
    "--subnet",
    subnet,
    "--ipv6=false",
    network,
  ]);
  run("sudo", ["iptables", "-I", ...firewall]);
  supa(
    "start",
    "--workdir",
    local,
    "--network-id",
    network,
    "--exclude",
    "studio,imgproxy,edge-runtime,logflare,vector,supavisor",
  );
  const escape = spawnSync(
    "docker",
    [
      "exec",
      container,
      "bash",
      "-c",
      "timeout 3 bash -c 'exec 3<>/dev/tcp/1.1.1.1/443'",
    ],
    { stdio: "ignore" },
  );
  assert(
    escape.status !== 0 && escape.status !== null,
    "Docker egress isolation failed",
  );
  // Restored cron payloads must never execute, even without external network access.
  run("docker", [
    "exec",
    "-i",
    container,
    "psql",
    "-X",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "ALTER SYSTEM SET cron.launch_active_jobs = 'off'",
  ]);
  run("docker", [
    "exec",
    "-i",
    container,
    "psql",
    "-X",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "select pg_reload_conf()",
  ]);
}
async function localAcceptance() {
  checkLedger(localQuery(ledgerSQL), await files(), 49);
  console.log(
    "Local baseline ledger verified: 49. Applying the six-file allowlist.",
  );
  for (const f of PENDING)
    await copyFile(
      join(root, "supabase/migrations", f),
      join(local, "supabase/migrations", f),
    );
  checkDryRun(dryRun("--local", "--workdir", local));
  supa("db", "push", "--local", "--workdir", local, "--skip-vault", "--yes");
  checkLedger(localQuery(ledgerSQL), await files(), 55);
  run(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "--single-transaction",
    ],
    {
      input: await readFile(
        join(root, "scripts/sql/release-acceptance.sql"),
        "utf8",
      ),
    },
  );
  const { dockerBrowser } = await import("./docker-browser.mjs");
  const status = JSON.parse(supa("status", "--workdir", local, "-o", "json"));
  console.log(
    "Local ledger 55 and transactional SQL acceptance passed. Starting real browser acceptance.",
  );
  await dockerBrowser(status, async (id, enabled = true) => {
    assert(/^[a-f0-9-]{36}$/.test(id), "Invalid local user identity");
    const sql = enabled
      ? `insert into public.admin_memberships(user_id) values('${id}') on conflict do nothing;
      insert into public.user_roles(user_id,role_id) select '${id}',id from public.roles where name='ADMIN';
      insert into public.user_permissions(user_id,permission_key,effect,scope) select '${id}',key,'allow','all' from public.permissions where key not in ('roles.manage','security.manage','integrations.manage','maintenance.manage') on conflict do nothing;`
      : `update public.admin_memberships set enabled=false where user_id='${id}'`;
    run(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-X",
        "-U",
        "supabase_admin",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: sql },
    );
  });
}
async function restoreStorage(manifest) {
  const status = JSON.parse(supa("status", "--workdir", local, "-o", "json"));
  const url = status.API_URL,
    key = status.SERVICE_ROLE_KEY;
  assert(
    new URL(url).hostname === "127.0.0.1",
    "Storage restore must target localhost",
  );
  for (const obj of manifest.objects) {
    const bytes = await readFile(join(backup, "objects", obj.file));
    assert(digest(bytes) === obj.sha256, "Storage backup checksum mismatch");
    await storage(url, key, `object/${objectPath(obj.bucket, obj.name)}`, {
      method: "POST",
      headers: { "Content-Type": obj.type, "x-upsert": "true" },
      body: bytes,
    });
    const restored = Buffer.from(
      await (
        await storage(url, key, `object/${objectPath(obj.bucket, obj.name)}`)
      ).arrayBuffer(),
    );
    assert(digest(restored) === obj.sha256, "Storage restoration mismatch");
  }
}
async function baseline() {
  checkLedger(await remoteQuery(ledgerSQL), await files(), 49);
  assert(
    (
      await remoteQuery(
        "select count(*)::int n from pg_tables where schemaname='public' and not rowsecurity",
      )
    )[0].n === 0,
    "Public table without RLS",
  );
}
async function captureDatabase(query, target) {
  await mkdir(backup, { recursive: true, mode: 0o700 });
  const before = await snapshot(query);
  for (const [name, args] of [
    ["roles.sql", ["--role-only"]],
    ["schema.sql", []],
    ["data.sql", ["--data-only", "--use-copy"]],
  ]) {
    supa("db", "dump", ...target, "--file", join(backup, name), ...args);
    assert((await stat(join(backup, name))).size > 0, "Empty database dump");
  }
  // CLI filters the ledger schema by default; back it up explicitly if absent.
  const schema = await readFile(join(backup, "schema.sql"), "utf8");
  const data = await readFile(join(backup, "data.sql"), "utf8");
  // Cron definitions/history belong in the encrypted backup too. Managed service
  // version bookkeeping is kept by each local service, not rewritten as app data.
  const extraCron =
    before.some((t) => t.table_schema === "cron") &&
    !/COPY\s+"?cron"?\."?job"?\s*\(/.test(data);
  if (extraCron)
    supa(
      "db",
      "dump",
      ...target,
      "--schema",
      "cron",
      "--data-only",
      "--use-copy",
      "--file",
      join(backup, "cron-data.sql"),
    );
  const extraLedger =
    !/CREATE TABLE (?:IF NOT EXISTS )?supabase_migrations\.schema_migrations/.test(
      schema,
    );
  if (extraLedger)
    for (const [name, args] of [
      ["ledger-schema.sql", []],
      ["ledger-data.sql", ["--data-only", "--use-copy"]],
    ])
      supa(
        "db",
        "dump",
        ...target,
        "--schema",
        "supabase_migrations",
        "--file",
        join(backup, name),
        ...args,
      );
  return { before, extraLedger, extraCron };
}
async function restoreDatabase(manifest) {
  const names = [
    "roles.sql",
    "schema.sql",
    ...(manifest.extraLedger ? ["ledger-schema.sql"] : []),
    "data.sql",
    ...(manifest.extraLedger ? ["ledger-data.sql"] : []),
    ...(manifest.extraCron ? ["cron-data.sql"] : []),
  ];
  let sql = "DROP SCHEMA IF EXISTS supabase_migrations CASCADE;\n";
  for (const name of names) {
    // Match the platform application owner so subsequent CLI migrations retain
    // their normal postgres ownership rights. Maintenance-only data import uses
    // the local superuser, never a changed production role.
    if (name === "schema.sql") sql += "SET ROLE postgres;\n";
    if (name === "data.sql")
      sql += "RESET ROLE; SET session_replication_role = replica;\n";
    sql += (await readFile(join(backup, name), "utf8")) + "\n";
  }
  run(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "--single-transaction",
    ],
    { input: sql },
  );
  compareSnapshot(manifest.before, await snapshot(localQuery, manifest.before));
}
async function backupAndTest() {
  for (const key of [
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_SERVICE_ROLE_KEY",
    "BACKUP_ENCRYPTION_KEY",
  ])
    assert(process.env[key], `Missing protected secret: ${key}`);
  encryptionKey();
  supa("link", "--project-ref", PROJECT);
  await baseline();
  assert(
    (await remoteQuery("select count(*)::int n from vault.secrets"))[0].n === 0,
    "Vault contains secrets: an additional verified Vault-key backup/restore procedure is required",
  );
  await mkdir(join(backup, "objects"), { recursive: true, mode: 0o700 });
  const { before, extraLedger, extraCron } = await captureDatabase(
    remoteQuery,
    ["--linked"],
  );
  const storageManifest = await inventoryStorage(join(backup, "objects"));
  const metadataCount = (
    await remoteQuery(
      `select count(*)::int n from storage.objects where bucket_id <> '${BUCKET}'`,
    )
  )[0].n;
  assert(
    metadataCount === storageManifest.objects.length,
    "Storage metadata/byte inventory mismatch",
  );
  compareSnapshot(before, await snapshot(remoteQuery, before));
  await jsonFile(join(backup, "manifest.json"), {
    before,
    storage: storageManifest,
    extraLedger,
    extraCron,
  });
  const archive = await uploadArchive();
  // Test the durable remote copy, never just the unuploaded local dump.
  await downloadArchive(archive.prefix, archive.attestation);
  await prepareLocal(true);
  const manifest = JSON.parse(
    await readFile(join(backup, "manifest.json"), "utf8"),
  );
  await restoreDatabase(manifest);
  await restoreStorage(manifest.storage);
  await localAcceptance();
  checkDryRun(dryRun("--linked"));
  console.log(
    "Durable encrypted DB/Storage backup restored; isolated SQL acceptance and exact six-file dry-run passed.",
  );
}
async function applyProduction() {
  await downloadArchive(process.env.BACKUP_PREFIX, process.env.BACKUP_DIGEST);
  const manifest = JSON.parse(
    await readFile(join(backup, "manifest.json"), "utf8"),
  );
  supa("link", "--project-ref", PROJECT);
  await baseline();
  compareSnapshot(
    manifest.before,
    await snapshot(remoteQuery, manifest.before),
  );
  checkDryRun(dryRun("--linked"));
  // The CLI executes pending migrations in order and stops on the first error.
  supa("db", "push", "--linked", "--skip-vault", "--yes");
  checkLedger(await remoteQuery(ledgerSQL), await files(), 55);
  compareSnapshot(
    manifest.before,
    await snapshot(remoteQuery, manifest.before),
    true,
  );
  assert(
    (
      await remoteQuery(
        "select count(*)::int n from pg_tables where schemaname='public' and not rowsecurity",
      )
    )[0].n === 0,
    "Post-deployment RLS check failed",
  );
  console.log(
    "55 migrations verified; existing rows preserved and all public tables retain RLS. Hosted functional acceptance remains required before PR merge.",
  );
}
async function main() {
  process.umask(0o077);
  await mkdir(scratch, { recursive: true, mode: 0o700 });
  const mode = process.argv[2];
  if (mode === "approval") return approval(process.argv[3]);
  if (mode === "local") {
    await prepareLocal();
    console.log(
      "Rehearsing database backup/restore on the disposable local baseline.",
    );
    const status = JSON.parse(supa("status", "--workdir", local, "-o", "json"));
    const { seedLocalBackup, verifyLocalBackupLogin } =
      await import("./docker-browser.mjs");
    const credentials = await seedLocalBackup(status);
    console.log("Local Auth and Storage backup fixtures created.");
    await mkdir(join(backup, "objects"), { recursive: true, mode: 0o700 });
    const storageManifest = await inventoryStorage(
      join(backup, "objects"),
      status.API_URL,
      status.SERVICE_ROLE_KEY,
    );
    const captured = await captureDatabase(localQuery, [
      // db dump has no --local flag in pinned CLI 2.120.0. This is the
      // disposable stack's public default credential, never a linked URL.
      "--db-url",
      `postgresql://postgres:postgres@${container}:5432/postgres`,
      "--workdir",
      local,
      "--network-id",
      network,
    ]);
    console.log("Disposable baseline database and Storage dumps captured.");
    await rm(join(local, "supabase/migrations"), {
      recursive: true,
      force: true,
    });
    await mkdir(join(local, "supabase/migrations"));
    supa(
      "db",
      "reset",
      "--local",
      "--no-seed",
      "--workdir",
      local,
      "--network-id",
      network,
    );
    await restoreDatabase(captured);
    await restoreStorage(storageManifest);
    await verifyLocalBackupLogin(status, credentials);
    console.log(
      "Disposable baseline backup restore and row fingerprints verified.",
    );
    await localAcceptance();
    console.log("Real Supabase Docker: 49 → 55 and SQL acceptance passed.");
  } else if (mode === "preflight") await backupAndTest();
  else if (mode === "apply") await applyProduction();
  else if (mode === "cleanup") {
    spawnSync(cli, ["stop", "--workdir", local, "--no-backup"], {
      stdio: "ignore",
    });
    spawnSync("docker", ["network", "rm", network], { stdio: "ignore" });
    spawnSync("sudo", ["iptables", "-D", ...firewall], { stdio: "ignore" });
    await rm(scratch, { recursive: true, force: true });
    await rm(join(root, "supabase/.temp"), { recursive: true, force: true });
  } else throw Error("Unknown release mode");
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    if (error instanceof ReleaseError) console.error(error.message);
    else if (process.argv[2] === "local")
      console.error(
        error.message
          .replace(/eyJ[A-Za-z0-9_.-]+/g, "[local JWT omitted]")
          .replace(/postgres(?:ql)?:\/\/\S+/g, "[local database URL omitted]"),
      );
    console.error(
      "Release stopped. No automatic rollback or ledger repair was attempted. Check the last completed gate; private command diagnostics are intentionally not logged.",
    );
    process.exitCode = 1;
  });
