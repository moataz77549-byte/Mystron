import { vector } from "@electric-sql/pglite-pgvector";
import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
let db: PGlite;
const owner = "11111111-1111-4111-8111-111111111111";
const author = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
let post: { id: string; version: number; status: string };
let cat: string;
let writer: string;
async function actor(id: string) {
  await db.exec(
    `reset role;insert into auth.sessions(id,user_id) values('${id}','${id}') on conflict do nothing;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);select set_config('request.jwt.claims','{"sub":"${id}","session_id":"${id}","iat":${Math.floor(Date.now() / 1000)}}',false)`,
  );
}
async function rpc(name: string, args: unknown[]) {
  const casts = args.map(
    (v, i) =>
      "$" + (i + 1) + (typeof v === "object" && v !== null ? "::jsonb" : ""),
  );
  const { rows } = await db.query<{ data: typeof post }>(
    `select to_jsonb(${name}(${casts.join(",")})) as data`,
    args.map((v) =>
      typeof v === "object" && v !== null ? JSON.stringify(v) : v,
    ),
  );
  return rows[0].data;
}
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
  await db.exec(
    `insert into auth.users values('${owner}','mtzallqmy@gmail.com',now()),('${author}','author@example.com',now()),('${other}','other@example.com',now());select private.bootstrap_owner('${owner}');insert into user_roles select '${author}',id from roles where name='AUTHOR';insert into user_roles select '${other}',id from roles where name='AUTHOR';`,
  );
  cat = (
    await db.query<{ id: string }>(
      "select id from categories where slug='books'",
    )
  ).rows[0].id;
  await actor(owner);
  const a = await rpc("cms_save_author", [
    null,
    { display_name: "كاتب الاختبار", slug: "test-writer" },
  ]);
  writer = a.id;
});
afterAll(async () => {
  await db.close();
});
it("migration replays; private storage and all new tables protected", async () => {
  await db.exec("reset role");
  const f = readdirSync("supabase/migrations").find((f) =>
    f.endsWith("_advanced_cms.sql"),
  )!;
  await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  expect(
    (await db.query<{ public: boolean }>("select public from storage.buckets"))
      .rows[0].public,
  ).toBe(false);
  expect(
    (
      await db.query(
        "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and not c.relrowsecurity",
      )
    ).rows,
  ).toEqual([]);
  await actor(author);
});
it("AUTHOR creates own draft with author/category and structured Arabic content", async () => {
  post = await rpc("cms_save_post", [
    null,
    {
      title: "قراءة في الأدب",
      slug: "قراءة-الأدب",
      author_id: writer,
      primary_category_id: cat,
      category_ids: [cat],
      content: "الإبداع والإنسان في الحياة",
      content_json: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "الإبداع والإنسان في الحياة" }],
          },
        ],
      },
      content_html: "<p>الإبداع والإنسان في الحياة</p>",
    },
    null,
  ]);
  expect(post.status).toBe("draft");
  expect(post.version).toBe(2);
});
it("optimistic autosave rejects stale version and isolates other authors", async () => {
  await expect(
    rpc("cms_save_post", [post.id, { title: "Stale" }, post.version - 1]),
  ).rejects.toThrow("VERSION_CONFLICT");
  await actor(other);
  expect((await db.query("select id from posts")).rows).toEqual([]);
  await expect(
    rpc("cms_save_post", [post.id, { title: "Attack" }, post.version]),
  ).rejects.toThrow("FORBIDDEN");
  await actor(author);
  post = await rpc("cms_save_post", [
    post.id,
    { title: "عنوان محرر" },
    post.version,
  ]);
  expect(post.version).toBe(3);
});
it("AUTHOR cannot publish, assign status by mass assignment or impersonate editor", async () => {
  await expect(
    rpc("cms_transition_post", [post.id, "publish", post.version, null]),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    rpc("cms_save_post", [
      post.id,
      { status: "published", created_by: owner },
      post.version,
    ]),
  ).rejects.toThrow("UNKNOWN_FIELD");
});
it("restores previous revision without restoring authority/publication state", async () => {
  const r = await db.query<{ id: string }>(
    "select id from post_revisions where post_id=$1 order by created_at desc limit 1",
    [post.id],
  );
  post = await rpc("cms_restore_revision", [r.rows[0].id, post.version]);
  expect(post.status).toBe("draft");
});
it("EDITOR workflow publishes atomically, public drafts remain hidden", async () => {
  post = await rpc("cms_transition_post", [
    post.id,
    "review",
    post.version,
    null,
  ]);
  await actor(owner);
  post = await rpc("cms_transition_post", [
    post.id,
    "publish",
    post.version,
    null,
  ]);
  expect(post.status).toBe("published");
  await db.exec("reset role;set role anon");
  expect((await db.query("select id from posts")).rows).toHaveLength(1);
  await expect(
    rpc("cms_save_post", [post.id, { title: "attack" }, post.version]),
  ).rejects.toThrow();
  await actor(owner);
});
it("normalizes Arabic search without changing original text", async () => {
  expect(
    (
      await db.query<{ text: string }>(
        "select public.normalize_arabic('إبْداعــ آفاق') as text",
      )
    ).rows[0].text,
  ).toBe("ابداع افاق");
  expect(
    (
      await db.query(
        "select id from posts where search_vector @@ plainto_tsquery('simple',public.normalize_arabic($1))",
        ["الابداع"],
      )
    ).rows,
  ).toHaveLength(1);
});
it("category hide/restore works, deletion without transfer rejects existing relationships", async () => {
  await rpc("cms_save_category", [
    cat,
    { name: "من بطون الكتب", slug: "books", is_active: false },
    null,
  ]);
  await expect(
    rpc("cms_save_category", [cat, { action: "delete" }, null]),
  ).rejects.toThrow();
  await rpc("cms_save_category", [cat, { is_active: true }, null]);
});
it("schedule/unpublish and repeated due task are idempotent", async () => {
  post = await rpc("cms_transition_post", [
    post.id,
    "unpublished",
    post.version,
    null,
  ]);
  post = await rpc("cms_transition_post", [
    post.id,
    "scheduled",
    post.version,
    new Date(Date.now() + 3600000).toISOString(),
  ]);
  await db.exec("reset role");
  await db.query(
    "update posts set scheduled_at=now()-interval '1 second' where id=$1",
    [post.id],
  );
  await db.query("select private.publish_due()");
  await db.query("select private.publish_due()");
  const p = await db.query<{ id: string; version: number; status: string }>(
    "select id,version,status from posts where id=$1",
    [post.id],
  );
  post = p.rows[0];
  expect(post.status).toBe("published");
  expect(
    (
      await db.query(
        "select id from publishing_runs where trigger='scheduled' and status='success'",
      )
    ).rows,
  ).toHaveLength(1);
});
it("guest comments are moderated and contact email remains private; depth is bounded", async () => {
  await db.exec("set role service_role");
  const r = await db.query<{ id: string }>(
    "select submit_guest_comment($1,null,$2,$3,$4) as id",
    [post.id, "زائر", "private@example.com", "تعليق عربي"],
  );
  await db.exec("reset role;set role anon");
  expect((await db.query("select id,body from comments")).rows).toEqual([]);
  await expect(
    db.query("select * from private.comment_contacts"),
  ).rejects.toThrow();
  await actor(owner);
  await rpc("cms_moderate_comment", [r.rows[0].id, "approved"]);
  await db.exec("reset role;set role anon");
  expect((await db.query("select body from comments")).rows).toEqual([
    { body: "تعليق عربي" },
  ]);
  await db.exec("reset role;set role service_role");
  await expect(
    db.query("select submit_guest_comment($1,null,$2,$3,$4)", [
      post.id,
      "زائر",
      "",
      "<script>bad</script>",
    ]),
  ).rejects.toThrow("INVALID_COMMENT");
  await db.exec("reset role");
});
it("views deduplicate same daily visitor and reject client increments", async () => {
  await db.exec("set role service_role");
  const h = "a".repeat(64);
  expect(
    (
      await db.query<{ ok: boolean }>("select record_post_view($1,$2) as ok", [
        post.id,
        h,
      ])
    ).rows[0].ok,
  ).toBe(true);
  expect(
    (
      await db.query<{ ok: boolean }>("select record_post_view($1,$2) as ok", [
        post.id,
        h,
      ])
    ).rows[0].ok,
  ).toBe(false);
  await db.exec("reset role;set role anon");
  await expect(
    db.query("select record_post_view($1,$2)", [post.id, "b".repeat(64)]),
  ).rejects.toThrow();
  expect(
    (
      await db.query<{ total_views: number }>(
        "select * from public_view_stats()",
      )
    ).rows[0].total_views,
  ).toBe(1);
  await actor(owner);
});
it("soft delete hides public content, restore returns draft and slug redirects resolve only published targets", async () => {
  post = await rpc("cms_save_post", [
    post.id,
    { slug: "قراءة-جديدة" },
    post.version,
  ]);
  post = await rpc("cms_transition_post", [
    post.id,
    "delete",
    post.version,
    null,
  ]);
  await db.exec("reset role;set role anon");
  expect((await db.query("select id from posts")).rows).toHaveLength(0);
  expect((await db.query("select * from slug_redirects")).rows).toHaveLength(0);
  await actor(owner);
  post = await rpc("cms_transition_post", [
    post.id,
    "restore",
    post.version,
    null,
  ]);
  expect(post.status).toBe("draft");
});
it("media references prevent deletion and unpublished assets stay unreadable to anonymous visitors", async () => {
  await actor(author);
  const id = "44444444-4444-4444-8444-444444444444";
  await rpc("cms_register_media", [
    {
      id,
      path: `${author}/${id}/original.png`,
      mime_type: "image/png",
      size_bytes: 100,
      width: 100,
      height: 100,
      variants: { optimized: `${author}/${id}/optimized.webp` },
    },
  ]);
  await db.exec("reset role;set role anon");
  expect((await db.query("select id from media_assets")).rows).toEqual([]);
  await actor(owner);
  post = await rpc("cms_save_post", [
    post.id,
    { cover_asset_id: id },
    post.version,
  ]);
  await expect(
    rpc("cms_update_media", [id, { action: "delete" }]),
  ).rejects.toThrow("MEDIA_IN_USE");
  post = await rpc("cms_transition_post", [
    post.id,
    "publish",
    post.version,
    null,
  ]);
  await db.exec("reset role;set role anon");
  expect((await db.query("select id from media_assets")).rows).toEqual([
    { id },
  ]);
  await expect(db.query("select created_by from posts")).rejects.toThrow();
  await actor(owner);
  post = await rpc("cms_transition_post", [
    post.id,
    "unpublished",
    post.version,
    null,
  ]);
  await db.exec("reset role;set role anon");
  expect((await db.query("select id from media_assets")).rows).toEqual([]);
  await actor(owner);
});
it("category cycles and redirect reuse are rejected; transfers preserve primary relationships", async () => {
  const a = await rpc("cms_save_category", [
    null,
    { name: "قسم اختبار", slug: "temporary-test", parent_id: cat },
    null,
  ]);
  await expect(
    rpc("cms_save_category", [cat, { parent_id: a.id }, null]),
  ).rejects.toThrow("CATEGORY_CYCLE");
  await rpc("cms_save_category", [a.id, { slug: "temporary-renamed" }, null]);
  await expect(
    rpc("cms_save_category", [a.id, { slug: "temporary-test" }, null]),
  ).rejects.toThrow("SLUG_RESERVED");
  await rpc("cms_save_category", [cat, { action: "delete" }, a.id]).catch(
    async () => {
      await rpc("cms_save_category", [a.id, { parent_id: null }, null]);
      await rpc("cms_save_category", [cat, { action: "delete" }, a.id]);
    },
  );
  expect(
    (
      await db.query<{ primary_category_id: string }>(
        "select primary_category_id from posts where id=$1",
        [post.id],
      )
    ).rows[0].primary_category_id,
  ).toBe(a.id);
});

it("explicit category transfer records revision/version and rejects AUTHOR", async () => {
  await actor(owner);
  const from = (
    await db.query<{ primary_category_id: string }>(
      "select primary_category_id from posts where id=$1",
      [post.id],
    )
  ).rows[0].primary_category_id;
  const to = (
    await db.query<{ id: string }>(
      "select id from categories where slug='news'",
    )
  ).rows[0].id;
  await actor(author);
  await expect(rpc("cms_move_category_posts", [from, to])).rejects.toThrow(
    "FORBIDDEN",
  );
  await actor(owner);
  const before = (
    await db.query<{ version: number }>(
      "select version from posts where id=$1",
      [post.id],
    )
  ).rows[0].version;
  expect(await rpc("cms_move_category_posts", [from, to])).toBe(1);
  const after = (
    await db.query<{ version: number; primary_category_id: string }>(
      "select version,primary_category_id from posts where id=$1",
      [post.id],
    )
  ).rows[0];
  expect(after.primary_category_id).toBe(to);
  expect(after.version).toBe(before + 1);
});
