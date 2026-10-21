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
  await db.exec("reset role;begin");
  try {
    const f = readdirSync("supabase/migrations").find((f) =>
      f.endsWith("_advanced_cms.sql"),
    )!;
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
    expect(
      (
        await db.query<{ public: boolean }>(
          "select public from storage.buckets",
        )
      ).rows[0].public,
    ).toBe(false);
    expect(
      (
        await db.query(
          "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and not c.relrowsecurity",
        )
      ).rows,
    ).toEqual([]);
  } finally {
    // Replaying an old migration must not leave obsolete RPC definitions
    // installed for the authorization tests that follow it.
    await db.exec("rollback");
    await actor(author);
  }
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

it("editorial list filters and Arabic normalization preserve current row permissions and trash isolation", async () => {
  await actor(owner);
  const category = (
    await db.query<{ id: string }>(
      "select id from categories where slug='news'",
    )
  ).rows[0].id;
  const writer = await rpc("cms_save_author", [
    null,
    { display_name: "كاتب الفلاتر", slug: "filter-writer" },
  ]);
  const first = await rpc("cms_save_post", [
    null,
    {
      title: "فلترة أَلِف",
      slug: "filter-first",
      author_id: writer.id,
      primary_category_id: category,
      category_ids: [category],
    },
    null,
  ]);
  await rpc("cms_save_post", [
    null,
    {
      title: "فلترة ألف ثانية",
      slug: "filter-second",
      author_id: writer.id,
      primary_category_id: category,
      category_ids: [category],
    },
    null,
  ]);
  async function list(filters: Record<string, unknown>, status = "draft") {
    return (
      await db.query<{
        data: {
          total: number;
          rows: {
            id: string;
            author_name: string;
            category_name: string;
            can_update: boolean;
            views: number;
          }[];
        };
      }>(
        "select public.admin_post_list_filtered(1,'الف',$1,$2::jsonb) as data",
        [status, JSON.stringify(filters)],
      )
    ).rows[0].data;
  }
  const found = await list({
    author_id: writer.id,
    category_id: category,
    page_size: 25,
    sort: "title",
  });
  expect(found.total).toBe(2);
  expect(found.rows).toHaveLength(2);
  expect(found.rows[0]).toMatchObject({
    author_name: "كاتب الفلاتر",
    category_name: "الأخبار المتنوعة",
    can_update: true,
    views: 0,
  });
  await rpc("cms_transition_post", [first.id, "delete", first.version, null]);
  expect((await list({}, "")).total).toBe(1);
  expect((await list({}, "trash")).rows.map((row) => row.id)).toEqual([
    first.id,
  ]);
  await expect(list({ sort: "untrusted SQL" })).rejects.toThrow(
    "INVALID_QUERY",
  );
  await expect(list({ page_size: 10001 })).rejects.toThrow("INVALID_QUERY");
  await actor(other);
  expect((await list({})).total).toBe(0);
  await expect(list({ sort: "views" })).rejects.toThrow("FORBIDDEN");
  await db.exec("reset role;set role anon");
  await expect(list({})).rejects.toThrow(/permission denied/);
  await db.exec("reset role");
  const migration = readdirSync("supabase/migrations").find((name) =>
    name.endsWith("_admin_editorial_overhaul.sql"),
  )!;
  await db.exec("begin");
  try {
    await db.exec(readFileSync("supabase/migrations/" + migration, "utf8"));
  } finally {
    // Replay coverage must not replace the current read model for later tests.
    await db.exec("rollback");
  }
});

it("tag merges reuse versioned saves, deduplicate tags and fail atomically on stale counts", async () => {
  await actor(owner);
  const first = await rpc("cms_save_post", [
    null,
    { title: "وسوم أولى", slug: "tags-first", tags: ["قديم", "نهائي", "ثابت"] },
    null,
  ]);
  const second = await rpc("cms_save_post", [
    null,
    { title: "وسوم ثانية", slug: "tags-second", tags: ["قديم"] },
    null,
  ]);
  await expect(
    db.query("select cms_merge_tag($1,$2,$3)", ["قديم", "نهائي", 1]),
  ).rejects.toThrow("VERSION_CONFLICT");
  const untouched = await db.query<{ tags: string[]; version: number }>(
    "select tags,version from posts where id=$1",
    [first.id],
  );
  expect(untouched.rows[0].tags).toContain("قديم");
  expect(untouched.rows[0].version).toBe(first.version);
  const merged = await db.query<{ result: { updated: number } }>(
    "select cms_merge_tag($1,$2,$3) result",
    ["قديم", "نهائي", 2],
  );
  expect(merged.rows[0].result.updated).toBe(2);
  const saved = await db.query<{ tags: string[]; version: number }>(
    "select tags,version from posts where id=$1",
    [first.id],
  );
  expect(saved.rows[0].tags).toEqual(["نهائي", "ثابت"]);
  expect(saved.rows[0].version).toBe(first.version + 1);
  expect(
    (
      await db.query("select id from post_revisions where post_id=$1", [
        second.id,
      ])
    ).rows.length,
  ).toBeGreaterThan(1);
  const again = await db.query<{ result: { updated: number } }>(
    "select cms_merge_tag($1,$2,$3) result",
    ["قديم", "نهائي", 2],
  );
  expect(again.rows[0].result.updated).toBe(0);
  await db.exec("reset role;set role anon");
  await expect(db.query("select admin_tag_list(1,'')")).rejects.toThrow();
  await actor(owner);
});
it("tag lists and mutations stay inside authors' allowed posts", async () => {
  await actor(owner);
  const privatePost = await rpc("cms_save_post", [
    null,
    { title: "وسم خاص", slug: "tag-private-owner", tags: ["وسم-خاص-للمالك"] },
    null,
  ]);
  await actor(other);
  const own = await rpc("cms_save_post", [
    null,
    { title: "وسم كاتب", slug: "tag-private-other", tags: ["وسم-خاص-للمالك"] },
    null,
  ]);
  const list = await db.query<{
    result: { rows: { posts: number; editable_posts: number }[] };
  }>("select admin_tag_list(1,$1) result", ["وسم-خاص-للمالك"]);
  expect(list.rows[0].result.rows[0]).toMatchObject({
    posts: 1,
    editable_posts: 1,
  });
  const merge = await db.query<{ result: { updated: number } }>(
    "select cms_merge_tag($1,$2,$3) result",
    ["وسم-خاص-للمالك", "وسم-الكاتب", 1],
  );
  expect(merge.rows[0].result.updated).toBe(1);
  await actor(owner);
  const original = await db.query<{ tags: string[] }>(
    "select tags from posts where id=$1",
    [privatePost.id],
  );
  expect(original.rows[0].tags).toEqual(["وسم-خاص-للمالك"]);
  expect(
    (
      await db.query<{ tags: string[] }>("select tags from posts where id=$1", [
        own.id,
      ])
    ).rows[0].tags,
  ).toEqual(["وسم-الكاتب"]);
});
it("report decisions update comment moderation and audit atomically without exposing visitor hashes", async () => {
  await actor(owner);
  const item = await rpc("cms_save_post", [
    null,
    { title: "بلاغ اختبار", slug: "report-fixture-post" },
    null,
  ]);
  await db.exec("reset role");
  const comment = (
    await db.query<{ id: string }>(
      "insert into comments(post_id,guest_name,body,status) values($1,'زائر اختبار','تعليق يحتاج مراجعة','approved') returning id",
      [item.id],
    )
  ).rows[0].id;
  const report = (
    await db.query<{ id: string }>(
      "insert into comment_reports(comment_id,reason,visitor_hash) values($1,'سبب بلاغ الاختبار','private-visitor-hash') returning id",
      [comment],
    )
  ).rows[0].id;
  await actor(other);
  await expect(
    db.query("select admin_report_list(1,'pending')"),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    db.query("select cms_resolve_report($1,'hidden')", [report]),
  ).rejects.toThrow("FORBIDDEN");
  await actor(owner);
  const list = await db.query<{ result: unknown }>(
    "select admin_report_list(1,'pending') result",
  );
  expect(JSON.stringify(list.rows)).not.toContain("private-visitor-hash");
  await db.query("select cms_resolve_report($1,'hidden')", [report]);
  const updated = await db.query<{ status: string }>(
    "select status from comments where id=$1",
    [comment],
  );
  expect(updated.rows[0].status).toBe("hidden");
  const decision = await db.query<{ resolution: string; resolved_at: string }>(
    "select resolution,resolved_at from comment_reports where id=$1",
    [report],
  );
  expect(decision.rows[0].resolution).toBe("hidden");
  expect(decision.rows[0].resolved_at).toBeTruthy();
  await db.query("select cms_resolve_report($1,'dismissed')", [report]);
  expect(
    (
      await db.query<{ resolution: string }>(
        "select resolution from comment_reports where id=$1",
        [report],
      )
    ).rows[0].resolution,
  ).toBe("hidden");
  expect(
    (
      await db.query(
        "select id from audit_logs where entity_id=$1 and action='comment_report_hidden'",
        [report],
      )
    ).rows,
  ).toHaveLength(1);
});

it("scoped moderation lists exclude out-of-category comments even when publicly approved", async () => {
  await actor(owner);
  const permittedCategory = await rpc("cms_save_category", [
    null,
    { name: "نطاق مراجعة أول", slug: "report-scope-first" },
    null,
  ]);
  const secondCategory = await rpc("cms_save_category", [
    null,
    { name: "نطاق مراجعة ثان", slug: "report-scope-second" },
    null,
  ]);
  const allowed = await rpc("cms_save_post", [
    null,
    {
      title: "نطاق مسموح",
      slug: "report-scope-allowed",
      primary_category_id: permittedCategory.id,
      category_ids: [permittedCategory.id],
    },
    null,
  ]);
  const denied = await rpc("cms_save_post", [
    null,
    {
      title: "نطاق ممنوع",
      slug: "report-scope-denied",
      primary_category_id: secondCategory.id,
      category_ids: [secondCategory.id],
    },
    null,
  ]);
  await db.exec("reset role");
  const firstComment = (
    await db.query<{ id: string }>(
      "insert into comments(post_id,guest_name,body,status) values($1,'زائر','مسموح','approved') returning id",
      [allowed.id],
    )
  ).rows[0].id;
  const secondComment = (
    await db.query<{ id: string }>(
      "insert into comments(post_id,guest_name,body,status) values($1,'زائر','ممنوع','approved') returning id",
      [denied.id],
    )
  ).rows[0].id;
  const allowedReport = (
    await db.query<{ id: string }>(
      "insert into comment_reports(comment_id,reason,visitor_hash) values($1,'بلاغ مسموح','scope-visitor-1') returning id",
      [firstComment],
    )
  ).rows[0].id;
  const deniedReport = (
    await db.query<{ id: string }>(
      "insert into comment_reports(comment_id,reason,visitor_hash) values($1,'بلاغ ممنوع','scope-visitor-2') returning id",
      [secondComment],
    )
  ).rows[0].id;
  await db.query("delete from user_roles where user_id=$1", [other]);
  await db.query(
    "insert into user_roles select $1,id from roles where name='EDITOR'",
    [other],
  );
  await db.query(
    "update admin_memberships set scope_mode='restricted',category_ids=array[$2::uuid] where user_id=$1",
    [other, permittedCategory.id],
  );
  await actor(other);
  const comments = await db.query<{ result: { rows: { id: string }[] } }>(
    "select admin_comment_list(1,'all') result",
  );
  expect(comments.rows[0].result.rows.map((row) => row.id)).toContain(
    firstComment,
  );
  expect(comments.rows[0].result.rows.map((row) => row.id)).not.toContain(
    secondComment,
  );
  const reports = await db.query<{ result: { rows: { id: string }[] } }>(
    "select admin_report_list(1,'pending') result",
  );
  expect(reports.rows[0].result.rows.map((row) => row.id)).toContain(
    allowedReport,
  );
  expect(reports.rows[0].result.rows.map((row) => row.id)).not.toContain(
    deniedReport,
  );
  await expect(
    db.query("select cms_resolve_report($1,'hidden')", [deniedReport]),
  ).rejects.toThrow("FORBIDDEN");
  await actor(owner);
  const untouched = await db.query<{ resolved_at: string | null }>(
    "select resolved_at from comment_reports where id=$1",
    [deniedReport],
  );
  expect(untouched.rows[0].resolved_at).toBeNull();
});

it("catalog metadata preserves existing values and cannot grant an author an admin identity", async () => {
  await actor(owner);
  const category = await rpc("cms_save_category", [
    null,
    { name: "لون اختبار", slug: "metadata-category", color: "#C77955" },
    null,
  ]);
  const record = await rpc("cms_save_author", [
    null,
    {
      display_name: "متخصص اختبار",
      slug: "metadata-writer",
      specialty: "  الأدب العربي  ",
    },
  ]);
  expect(
    (
      await db.query<{ color: string }>(
        "select color from categories where id=$1",
        [category.id],
      )
    ).rows[0].color,
  ).toBe("#C77955");
  expect(
    (
      await db.query<{ specialty: string; profile_id: string | null }>(
        "select specialty,profile_id from authors where id=$1",
        [record.id],
      )
    ).rows[0],
  ).toEqual({ specialty: "الأدب العربي", profile_id: null });
  await rpc("cms_save_category", [
    category.id,
    { name: "اسم آخر", slug: "metadata-category" },
    null,
  ]);
  expect(
    (
      await db.query<{ color: string }>(
        "select color from categories where id=$1",
        [category.id],
      )
    ).rows[0].color,
  ).toBe("#C77955");
  await expect(
    rpc("cms_save_category", [
      category.id,
      { color: "red; background:url(https://example.test)" },
      null,
    ]),
  ).rejects.toThrow();
  await expect(
    rpc("cms_save_author", [record.id, { specialty: "x".repeat(201) }]),
  ).rejects.toThrow();
  await actor(author);
  await expect(
    rpc("cms_save_category", [category.id, { color: "#ffffff" }, null]),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    rpc("cms_save_author", [record.id, { specialty: "تغيير ممنوع" }]),
  ).rejects.toThrow("FORBIDDEN");
  await actor(owner);
});

it("self-service sessions hide other users and revoke own access immediately without security.manage", async () => {
  const extra = "55555555-5555-4555-8555-555555555555";
  await db.exec("reset role");
  await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
    extra,
    author,
  ]);
  await actor(author);
  const visible = await db.query<{
    result: { rows: { id: string; is_current: boolean }[] };
  }>("select admin_my_sessions(1) result");
  expect(visible.rows[0].result.rows.map((row) => row.id)).toContain(extra);
  expect(visible.rows[0].result.rows.map((row) => row.id)).not.toContain(owner);
  expect(
    visible.rows[0].result.rows.find((row) => row.id === author)?.is_current,
  ).toBe(true);
  await expect(
    db.query("select admin_revoke_my_session($1)", [owner]),
  ).rejects.toThrow("NOT_FOUND");
  await expect(
    db.query("select admin_revoke_my_session($1)", [author]),
  ).rejects.toThrow("CURRENT_SESSION_USE_LOGOUT");
  await db.query("select admin_revoke_my_session($1)", [extra]);
  await db.query("select admin_revoke_my_session($1)", [extra]);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: author,
      session_id: extra,
      iat: Math.floor(Date.now() / 1000),
    }),
  ]);
  await expect(db.query("select admin_my_sessions(1)")).rejects.toThrow(
    "FORBIDDEN",
  );
  await actor(owner);
  expect(
    (
      await db.query(
        "select id from audit_logs where actor_id=$1 and action='OWN_SESSION_REVOKED' and entity_id=$2",
        [author, extra],
      )
    ).rows,
  ).toHaveLength(1);
  await db.exec("reset role;set role anon");
  await expect(db.query("select admin_my_sessions(1)")).rejects.toThrow();
  await actor(owner);
});
it("editorial approval is scoped, idempotent and valid only for the reviewed version", async () => {
  await actor(author);
  let item = await rpc("cms_save_post", [
    null,
    { title: "نسخة للاعتماد", slug: "approval-version" },
  ]);
  await expect(
    rpc("cms_transition_post", [item.id, "approve", item.version]),
  ).rejects.toThrow(/FORBIDDEN/);
  await actor(owner);
  await expect(
    rpc("cms_transition_post", [item.id, "approve", item.version]),
  ).rejects.toThrow(/APPROVAL_REQUIRES_REVIEW/);
  item = await rpc("cms_transition_post", [item.id, "review", item.version]);
  const approved = await rpc("cms_transition_post", [
    item.id,
    "approve",
    item.version,
  ]);
  expect(approved).toMatchObject({
    status: "review",
    version: item.version,
    approved_version: item.version,
    approved_by: owner,
  });
  expect(
    await rpc("cms_transition_post", [item.id, "approve", item.version]),
  ).toEqual(approved);
  expect(
    (
      await db.query<{ count: number }>(
        "select count(*)::int as count from audit_logs where action='post_approved' and entity_id=$1",
        [item.id],
      )
    ).rows[0].count,
  ).toBe(1);
  const listed = await db.query<{ data: { rows: { id: string }[] } }>(
    "select public.admin_post_list_filtered(1,'','approved','{}'::jsonb) data",
  );
  expect(listed.rows[0].data.rows.some((row) => row.id === item.id)).toBe(true);
  item = await rpc("cms_save_post", [
    item.id,
    { title: "نسخة معدلة بعد الاعتماد" },
    item.version,
  ]);
  expect(item.version).toBeGreaterThan(
    (approved as typeof approved & { approved_version: number })
      .approved_version,
  );
  const staleList = await db.query<{ data: { rows: { id: string }[] } }>(
    "select public.admin_post_list_filtered(1,'','approved','{}'::jsonb) data",
  );
  expect(staleList.rows[0].data.rows.some((row) => row.id === item.id)).toBe(
    false,
  );
  await expect(
    rpc("cms_transition_post", [item.id, "approve", approved.version]),
  ).rejects.toThrow(/VERSION_CONFLICT/);
  const renewed = await rpc("cms_transition_post", [
    item.id,
    "approve",
    item.version,
  ]);
  expect(renewed).toMatchObject({
    approved_version: item.version,
    status: "review",
  });
  await actor(other);
  await expect(
    db.query("update public.posts set approved_version=version where id=$1", [
      item.id,
    ]),
  ).rejects.toThrow();
  await actor(owner);
});
it("static page drafts remain private; saves are versioned, audited and never grant author authority", async () => {
  const patch = {
    slug: "testing-page",
    title: "صفحة الثقافة",
    description: "وصف الاختبار",
    content_json: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "محتوى الصفحة" }],
        },
      ],
    },
    is_published: false,
  };
  await actor(author);
  await expect(rpc("cms_save_page", [null, patch])).rejects.toThrow(
    /FORBIDDEN/,
  );
  await actor(owner);
  await expect(rpc("cms_save_page", [null, patch])).rejects.toThrow(
    /PIN_SETUP_REQUIRED/,
  );
  await db.exec("reset role");
  await db.query("select public.security_save_pin($1,$2,600,true)", [
    owner,
    "scrypt-v1$" + "0".repeat(32) + "$" + "0".repeat(128),
  ]);
  await db.query("select public.security_create_proof($1,$1,$2,true)", [
    owner,
    "a".repeat(64),
  ]);
  await actor(owner);
  await db.query("select set_config('request.headers',$1,false)", [
    JSON.stringify({ "x-maystroon-proof": "a".repeat(64) }),
  ]);
  let item = await rpc("cms_save_page", [null, patch]);
  await db.exec("set role anon");
  expect(
    (
      await db.query(
        "select id,slug,content_json from site_pages where slug='testing-page'",
      )
    ).rows,
  ).toEqual([]);
  await expect(db.query("select updated_by from site_pages")).rejects.toThrow(
    /permission denied/,
  );
  await actor(owner);
  const published = await rpc("cms_save_page", [
    item.id,
    { ...patch, is_published: true },
    item.version,
  ]);
  await expect(
    rpc("cms_save_page", [item.id, patch, item.version]),
  ).rejects.toThrow(/VERSION_CONFLICT/);
  await expect(
    rpc("cms_save_page", [
      item.id,
      { ...patch, slug: "moved-page" },
      published.version,
    ]),
  ).rejects.toThrow(/SLUG_RESERVED/);
  await db.exec("set role anon");
  expect(
    (await db.query("select title from site_pages where slug='testing-page'"))
      .rows,
  ).toEqual([{ title: "صفحة الثقافة" }]);
  await actor(owner);
  item = await rpc("cms_save_page", [item.id, patch, published.version]);
  expect(item.version).toBe(published.version + 1);
  expect(
    (
      await db.query<{ count: number }>(
        "select count(*)::int count from audit_logs where action='PAGE_SAVED' and entity_id=$1",
        [item.id],
      )
    ).rows[0].count,
  ).toBe(3);
  await expect(
    rpc("cms_save_page", [null, { ...patch, slug: "../admin" }]),
  ).rejects.toThrow();
  await expect(
    rpc("cms_save_page", [
      null,
      { ...patch, slug: "invalid-doc", content_json: { type: "evil" } },
    ]),
  ).rejects.toThrow();
  await actor(author);
  expect(
    (await db.query("select id from site_pages where slug='testing-page'"))
      .rows,
  ).toEqual([]);
  await actor(owner);
  const arabic = await rpc("cms_save_page", [
    null,
    { ...patch, slug: "سياسة-التحرير" },
  ]);
  expect(arabic).toMatchObject({ slug: "سياسة-التحرير" });
});
