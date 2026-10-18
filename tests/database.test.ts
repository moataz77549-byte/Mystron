import { vector } from "@electric-sql/pglite-pgvector";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
let db: PGlite;
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const published = "33333333-3333-4333-8333-333333333333";
const sql = readFileSync(
  "supabase/migrations/" +
    readdirSync("supabase/migrations").find((x) =>
      x.endsWith("_foundation.sql"),
    ),
  "utf8",
);
beforeAll(async () => {
  db = new PGlite({ extensions: { vector } });
  await db.exec(
    `create role anon;create role authenticated;create role authenticator;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  await db.exec(
    "create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;",
  );
  await db.exec(
    "create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now(),updated_at timestamptz default now(),aal text default 'aal1',not_after timestamptz);create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;grant execute on function auth.jwt() to anon,authenticated;",
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  }
});
afterAll(async () => {
  await db.close();
});
describe("PostgreSQL migration and RLS", () => {
  it("Storage migration is idempotent and excludes executable types", async () => {
    const file = readdirSync("supabase/migrations").find((x) =>
      x.endsWith("_storage.sql"),
    );
    const storageSql = readFileSync("supabase/migrations/" + file, "utf8");
    await db.exec(storageSql);
    await db.exec(storageSql);
    const { rows } = await db.query(
      "select file_size_limit::int as bytes,allowed_mime_types as types from storage.buckets",
    );
    expect(rows[0]).toMatchObject({
      bytes: 5242880,
      types: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    });
  });

  it("replays without duplicates; all tables have RLS", async () => {
    await db.exec(sql);
    const policySql = readFileSync(
      "supabase/migrations/" +
        readdirSync("supabase/migrations").find((x) =>
          x.endsWith("_optimize_read_policies.sql"),
        ),
      "utf8",
    );
    await db.exec(policySql);
    const cats = await db.query("select count(*)::int as n from categories");
    expect(cats.rows[0]).toEqual({ n: 6 });
    const r = await db.query(
      "select relname from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname in ('public','private') and relkind='r' and not relrowsecurity",
    );
    expect(r.rows).toEqual([]);
  });
  it("hides drafts, private, deleted and future posts; public cannot mutate", async () => {
    await db.exec(
      `insert into posts(id,title,slug,status,published_at) values('${published}','Published','public','published',now());insert into posts(title,slug) values('Draft','draft');insert into posts(title,slug,status,visibility,published_at) values('Private','private','published','private',now());insert into posts(title,slug,status,published_at) values('Future','future','published',now()+interval '1 day');insert into posts(title,slug,status,published_at,deleted_at) values('Deleted','deleted','published',now(),now());set role anon;`,
    );
    expect((await db.query("select slug from posts")).rows).toEqual([
      { slug: "public" },
    ]);
    await expect(
      db.exec("insert into posts(title,slug) values('Attack','attack')"),
    ).rejects.toThrow();
    await expect(
      db.query("select * from private.account_pins"),
    ).rejects.toThrow();
    await expect(
      db.exec(`select public.consume_rate_limit('${"a".repeat(64)}',5,60)`),
    ).rejects.toThrow();
    await db.exec("reset role");
  });
  it("bootstrap refuses unverified identity and closes after explicit verified UUID", async () => {
    await db.exec(
      `insert into auth.users values('${owner}','mtzallqmy@gmail.com',null),('${other}','other@example.com',now());`,
    );
    await expect(
      db.exec(`select private.bootstrap_owner('${owner}')`),
    ).rejects.toThrow("verified owner");
    await db.exec(
      `update auth.users set email_confirmed_at=now() where id='${owner}';set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    await expect(
      db.exec(`select private.bootstrap_owner('${owner}')`),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `insert into user_roles select '${owner}',id from roles where name='OWNER'`,
      ),
    ).rejects.toThrow();
    await db.exec("reset role");
    await db.exec(`select private.bootstrap_owner('${owner}')`);
    await expect(
      db.exec(`select private.bootstrap_owner('${owner}')`),
    ).rejects.toThrow("bootstrap closed");
  });
  it("user roles are own-only and staff lookup permits owner read", async () => {
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${other}',false)`,
    );
    expect((await db.query("select * from user_roles")).rows).toHaveLength(0);
    expect((await db.query("select slug from posts")).rows).toHaveLength(1);
    await db.exec(
      `select set_config('request.jwt.claim.sub','${owner}',false)`,
    );
    expect((await db.query("select * from user_roles")).rows).toHaveLength(1);
    expect((await db.query("select slug from posts")).rows).toHaveLength(5);
    await db.exec("reset role");
  });
  it("shared limiter serializes attempts and PIN RPC is service-only", async () => {
    await db.exec("set role service_role");
    const key = "b".repeat(64);
    for (let i = 0; i < 5; i++)
      expect(
        (await db.query(`select consume_rate_limit('${key}',5,900) as ok`))
          .rows,
      ).toEqual([{ ok: true }]);
    expect(
      (await db.query(`select consume_rate_limit('${key}',5,900) as ok`)).rows,
    ).toEqual([{ ok: false }]);
    await db.exec(
      `select set_account_pin('${owner}','scrypt-v1$${"a".repeat(32)}$${"b".repeat(128)}')`,
    );
    await expect(
      db.exec(
        `select set_account_pin('${other}','scrypt-v1$${"a".repeat(32)}$${"b".repeat(128)}')`,
      ),
    ).rejects.toThrow("unauthorized");
    await db.exec("reset role");
  });
});
