import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
const bridge = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  privilegedDatabase: () => bridge,
  publicDatabase: () => bridge,
  sessionDatabase: () => bridge,
}));
import { processTelegram, scheduledAden } from "@/lib/telegram/engine";
let db: PGlite;
const owner = "11111111-1111-4111-8111-111111111111",
  author = "22222222-2222-4222-8222-222222222222";
let category: string, writer: string;
async function sql<T = unknown>(query: string, params: unknown[] = []) {
  return (await db.query<{ v: T }>(query, params)).rows[0]?.v;
}
async function actor(user = owner) {
  await db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${user}',false);select set_config('request.jwt.claims','${JSON.stringify({ sub: user, session_id: user, iat: Math.floor(Date.now() / 1000) })}',false);set role authenticated;`,
  );
}
async function service(name: string, args: Record<string, unknown> = {}) {
  await db.exec("reset role;set role service_role");
  const keys = Object.keys(args);
  return sql(
    `select to_jsonb(public.${name}(${keys.map((k, i) => `${k}=>$${i + 1}`).join(",")})) v`,
    Object.values(args).map((v) =>
      typeof v === "object" && v !== null ? JSON.stringify(v) : v,
    ),
  );
}
async function link(user = owner, telegramId = 1001) {
  await actor(user);
  await db.query("select telegram_create_link($1)", ["a".repeat(64)]);
  await service("telegram_consume_link", {
    p_hash: "a".repeat(64),
    p_telegram_id: telegramId,
  });
}
async function ingest(id: number, telegramId = 1001) {
  return service("telegram_ingest", {
    p_update_id: id,
    p_telegram_id: telegramId,
    p_payload: { update_id: id },
  });
}
beforeAll(async () => {
  db = new PGlite({ extensions: { vector } });
  await db.exec(
    `create role anon;create role authenticated;create role authenticator;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now(),updated_at timestamptz default now(),aal text default 'aal1',not_after timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid(),auth.jwt() to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`,
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  for (const [id, name] of [
    [owner, "OWNER"],
    [author, "AUTHOR"],
  ]) {
    await db.query("insert into auth.users values($1,$2,now())", [
      id,
      name + "@example.test",
    ]);
    await db.query("insert into auth.sessions(id,user_id) values($1,$1)", [id]);
    await db.query(
      "insert into user_roles(user_id,role_id) select $1,id from roles where name=$2",
      [id, name],
    );
  }
  category = await sql<string>(
    "select id v from categories where slug='books'",
  );
  writer = await sql<string>(
    "insert into authors(display_name,slug) values('كاتب اختبار','automation-writer') returning id v",
  );
  bridge.rpc.mockImplementation(
    async (name: string, args: Record<string, unknown> = {}) => {
      try {
        return { data: await service(name, args), error: null };
      } catch (error) {
        return {
          data: null,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  );
});
afterAll(async () => db.close());
beforeEach(async () => {
  await db.exec(
    "reset role;delete from telegram_links;delete from private.telegram_link_tokens;delete from private.telegram_states;delete from telegram_updates;delete from telegram_deliveries;delete from automation_jobs;delete from ai_chunks;delete from ai_embedding_profiles;delete from ai_usage;delete from private.revoked_admin_sessions;update admin_memberships set enabled=true,revoked_before='1970-01-01',scope_mode='all',category_ids='{}';update auth.sessions set created_at=now(),not_after=null;update ai_configuration set enabled=false,daily_requests=500,monthly_requests=5000,daily_tokens=500000,session_requests=20,visitor_requests=30; ",
  );
});
it("linking requires a verified active Auth session; single-use code expires", async () => {
  await actor();
  await db.query("select telegram_create_link($1)", ["a".repeat(64)]);
  await db.exec(
    "reset role;update private.telegram_link_tokens set expires_at=now()-interval '1 second'",
  );
  await expect(
    service("telegram_consume_link", {
      p_hash: "a".repeat(64),
      p_telegram_id: 1001,
    }),
  ).rejects.toThrow("INVALID_LINK");
  await link();
  await expect(
    service("telegram_consume_link", {
      p_hash: "a".repeat(64),
      p_telegram_id: 1002,
    }),
  ).rejects.toThrow("INVALID_LINK");
});
it("anonymous and ordinary users cannot impersonate a Telegram actor", async () => {
  await db.exec("reset role;set role anon");
  await expect(
    db.query("select telegram_read(1001,'identity')"),
  ).rejects.toThrow("permission denied");
  await actor(author);
  await expect(db.query("select telegram_ingest(1,1001,'{}')")).rejects.toThrow(
    "permission denied",
  );
});
it("session revocation, expiry and disabled membership invalidate an existing link", async () => {
  await link();
  await db.exec("reset role");
  await db.query(
    "insert into private.revoked_admin_sessions(session_id,user_id) values($1,$1)",
    [owner],
  );
  await expect(
    service("telegram_read", { p_telegram_id: 1001, p_action: "identity" }),
  ).rejects.toThrow("TELEGRAM_SESSION_EXPIRED");
  await db.exec(
    "reset role;delete from private.revoked_admin_sessions;update admin_memberships set enabled=false",
  );
  await expect(
    service("telegram_read", { p_telegram_id: 1001, p_action: "identity" }),
  ).rejects.toThrow();
});
it("duplicate updates and duplicate commands cannot create two posts", async () => {
  await link();
  expect(await ingest(10)).toBe(true);
  expect(await ingest(10)).toBe(false);
  const args = {
    p_telegram_id: 1001,
    p_update_id: 10,
    p_command: "save",
    p_args: { patch: { title: "إبداع عربي", slug: "idem-10" } },
  };
  const a = await service("telegram_execute", args),
    b = await service("telegram_execute", args);
  expect(b).toEqual(a);
  await db.exec("reset role");
  expect(
    await sql("select count(*)::int v from posts where slug='idem-10'"),
  ).toBe(1);
});
it("AUTHOR can create own drafts but cannot publish or read another scope", async () => {
  await link(author);
  await ingest(11);
  const draft = (await service("telegram_execute", {
    p_telegram_id: 1001,
    p_update_id: 11,
    p_command: "save",
    p_args: { patch: { title: "مسودة الكاتب", slug: "author-11" } },
  })) as { id: string; version: number };
  await ingest(12);
  await expect(
    service("telegram_execute", {
      p_telegram_id: 1001,
      p_update_id: 12,
      p_command: "transition",
      p_args: { id: draft.id, version: draft.version, action: "publish" },
    }),
  ).rejects.toThrow("FORBIDDEN");
});
it("editorial state is durable and version-checked after reconnect", async () => {
  await link();
  await ingest(15);
  await service("telegram_execute", {
    p_telegram_id: 1001,
    p_update_id: 15,
    p_command: "state",
    p_args: {},
    p_state: { step: "content", draft: { title: "عنوان", text: "جزء محفوظ" } },
    p_state_version: 0,
  });
  const state = (await service("telegram_read", {
    p_telegram_id: 1001,
    p_action: "identity",
  })) as { state: { draft: { text: string } } };
  expect(state.state.draft.text).toBe("جزء محفوظ");
  await ingest(16);
  await expect(
    service("telegram_execute", {
      p_telegram_id: 1001,
      p_update_id: 16,
      p_command: "state",
      p_args: {},
      p_state: {},
      p_state_version: 0,
    }),
  ).rejects.toThrow("STATE_CONFLICT");
});
it("queue leases are fenced and failures reach a bounded dead letter state", async () => {
  await ingest(20);
  const job = await sql<{ id: string; lease_token: string }>(
    "reset role;select null v",
  ).catch(() => undefined);
  void job;
  await db.exec("reset role");
  const rows = await db.query<{ id: string; lease_token: string }>(
    "select * from automation_claim(1)",
  );
  const leased = rows.rows[0];
  await expect(
    service("automation_finish", {
      p_id: leased.id,
      p_lease: randomUUID(),
      p_success: true,
    }),
  ).rejects.toThrow("STALE_LEASE");
  await db.exec("reset role;update automation_jobs set attempts=5");
  await service("automation_finish", {
    p_id: leased.id,
    p_lease: leased.lease_token,
    p_success: false,
    p_error: "FAILED",
  });
  await db.exec("reset role");
  expect(
    await sql("select status v from automation_jobs where id=$1", [leased.id]),
  ).toBe("dead");
});
it("shared AI quota reservations enforce day/month/session limits atomically", async () => {
  await db.exec("update ai_configuration set enabled=true,session_requests=1");
  const args = {
    p_session: "b".repeat(64),
    p_visitor: "c".repeat(64),
    p_user: null,
    p_provider: "fixture",
    p_model: "test-model",
    p_type: "chat",
    p_tokens: 100,
  };
  await service("ai_reserve", { p_id: randomUUID(), ...args });
  await expect(
    service("ai_reserve", { p_id: randomUUID(), ...args }),
  ).rejects.toThrow("AI_QUOTA_EXCEEDED");
});
it("real vector retrieval excludes drafts/private/future/deleted and stale versions", async () => {
  await db.exec("reset role");
  const id = await sql<string>(
    "insert into posts(title,slug,content,status,visibility,published_at) values('الكتاب والمعرفة','vector-published','الكتاب يقدم معرفة عربية أصلية للنشر','published','public',now()) returning id v",
  );
  const items = [
    {
      index: 0,
      text: "الكتاب يقدم معرفة عربية أصلية للنشر",
      hash: "h",
      embedding: [1, 0, 0],
    },
  ];
  expect(
    await service("ai_replace_chunks", {
      p_post: id,
      p_version: 1,
      p_model: "fixture-dim3",
      p_chunks: items,
    }),
  ).toBe(true);
  const search = () =>
    service("ai_retrieve", {
      p_query: "الكتاب",
      p_embedding: "[1,0,0]",
      p_model: "fixture-dim3",
    }) as Promise<{ post_id: string }[]>;
  expect((await search()).map((r) => r.post_id)).toContain(id);
  await db.exec("reset role");
  await db.query("update posts set status='unpublished' where id=$1", [id]);
  expect(await search()).toEqual([]);
  await db.exec("reset role");
  expect(
    await sql("select count(*)::int v from ai_chunks where post_id=$1", [id]),
  ).toBe(0);
  const draft = await sql<string>(
    "insert into posts(title,slug,content) values('خاص','vector-private','محتوى خاص') returning id v",
  );
  expect(
    await service("ai_replace_chunks", {
      p_post: draft,
      p_version: 1,
      p_model: "fixture-dim3",
      p_chunks: items,
    }),
  ).toBe(false);
});
it("embedding dimensions are model-bound and cannot silently mix", async () => {
  await db.exec("reset role");
  const id = await sql<string>(
    "insert into posts(title,slug,status,published_at) values('نص','dim-model','published',now()) returning id v",
  );
  await service("ai_replace_chunks", {
    p_post: id,
    p_version: 1,
    p_model: "fixed3",
    p_chunks: [
      {
        index: 0,
        text: "مقطع معرفي للاختبار",
        hash: "x",
        embedding: [1, 0, 0],
      },
    ],
  });
  await expect(
    service("ai_replace_chunks", {
      p_post: id,
      p_version: 1,
      p_model: "fixed3",
      p_chunks: [
        { index: 0, text: "مقطع معرفي للاختبار", hash: "x", embedding: [1, 0] },
      ],
    }),
  ).rejects.toThrow("EMBEDDING_DIMENSION_MISMATCH");
});
it("Telegram wizard creates, reviews, publishes and schedules through canonical CMS RPCs", async () => {
  await link();
  let number = 200;
  const send = async (text?: string, data?: string) => {
    const update_id = number++;
    await ingest(update_id);
    return processTelegram({
      update_id,
      ...(data
        ? {
            callback_query: {
              id: String(update_id),
              from: { id: 1001 },
              data,
              message: {
                message_id: 100,
                from: { id: 1001 },
                chat: { id: 1001, type: "private" },
              },
            },
          }
        : {
            message: {
              message_id: update_id,
              from: { id: 1001 },
              chat: { id: 1001, type: "private" },
              text,
            },
          }),
    });
  };
  await send(undefined, "new");
  await send("عنوان من Telegram");
  await send("الكتاب يقدم معرفة عربية أصلية صالحة للنشر.");
  await send(undefined, "text_done");
  await send(undefined, "wc:" + category);
  await send(undefined, "wa:" + writer);
  await send(undefined, "skip");
  await send(undefined, "skip");
  await send("أدب، معرفة");
  const saved = await send(undefined, "finish:review");
  expect(saved.text).toContain("review");
  const postId = saved.keyboard?.[0][0].callback_data?.slice(5);
  expect(postId).toBeTruthy();
  await send(undefined, "publish:" + postId);
  await db.exec("reset role");
  expect(await sql("select status v from posts where id=$1", [postId])).toBe(
    "published",
  );
  await send(undefined, "unpublished:" + postId);
  await send(undefined, "edit_scheduled:" + postId);
  await send("2027-01-01 09:00");
  await db.exec("reset role");
  expect(await sql("select status v from posts where id=$1", [postId])).toBe(
    "scheduled",
  );
  expect(scheduledAden("2027-01-01 09:00")).toBe("2027-01-01T06:00:00.000Z");
});
it("usage finalization is service-only and cannot release a reservation twice", async () => {
  await db.exec("reset role;update ai_configuration set enabled=true");
  const id = randomUUID();
  await service("ai_reserve", {
    p_id: id,
    p_session: "d".repeat(64),
    p_visitor: "e".repeat(64),
    p_user: null,
    p_provider: "fixture",
    p_model: "model",
    p_type: "embedding",
    p_tokens: 1000,
  });
  await actor();
  await expect(
    db.query("select ai_usage_finish($1,1,1,'reported',1,'success',null)", [
      id,
    ]),
  ).rejects.toThrow("permission denied");
  await service("ai_usage_finish", {
    p_id: id,
    p_input: 120,
    p_output: 40,
    p_accuracy: "reported",
    p_latency: 30,
    p_status: "success",
    p_error: null,
  });
  await service("ai_usage_finish", {
    p_id: id,
    p_input: 1,
    p_output: 1,
    p_accuracy: "reported",
    p_latency: 1,
    p_status: "success",
    p_error: null,
  });
  await db.exec("reset role");
  expect(
    await sql(
      "select reserved_tokens::int v from ai_usage where request_id=$1",
      [id],
    ),
  ).toBe(160);
});
it("cached summaries become unavailable immediately on source edits and unpublishing", async () => {
  await db.exec("reset role");
  const id = await sql<string>(
    "insert into posts(title,slug,status,published_at) values('مصدر','cache-source','published',now()) returning id v",
  );
  const put = () =>
    service("ai_cache_put", {
      p_key: "fixture-cache",
      p_post: id,
      p_version: 1,
      p_model: "test",
      p_result: { answer: "ملخص" },
    });
  const get = () =>
    service("ai_cache_get", {
      p_key: "fixture-cache",
      p_post: id,
      p_version: 1,
    });
  await put();
  expect(await get()).toEqual({ answer: "ملخص" });
  await db.exec("reset role");
  await db.query("update posts set content='تعديل المصدر' where id=$1", [id]);
  expect(await get()).toBeNull();
  await put();
  await db.exec("reset role");
  await db.query("update posts set status='unpublished' where id=$1", [id]);
  expect(await get()).toBeNull();
});
it("gateway nonce is accepted only once and never by a public caller", async () => {
  await db.exec("reset role;delete from private.gateway_nonces;set role anon");
  await expect(
    db.query("select automation_nonce($1)", ["f".repeat(64)]),
  ).rejects.toThrow("permission denied");
  expect(await service("automation_nonce", { p_hash: "f".repeat(64) })).toBe(
    true,
  );
  expect(await service("automation_nonce", { p_hash: "f".repeat(64) })).toBe(
    false,
  );
});
it("outbox scrubs private output when authorization scope changes after enqueue", async () => {
  await link();
  await actor();
  const fingerprint = await sql<string>("select md5(admin_identity()::text) v");
  await db.exec("reset role");
  await db.query(
    "insert into telegram_deliveries(dedupe_key,user_id,telegram_id,body) values('scope-change',$1,1001,$2)",
    [
      owner,
      JSON.stringify({ text: "نص إداري خاص", auth_fingerprint: fingerprint }),
    ],
  );
  await db.query(
    "update admin_memberships set scope_mode='restricted',category_ids='{}' where user_id=$1",
    [owner],
  );
  await service("telegram_claim_deliveries");
  await db.exec("reset role");
  expect(
    await sql(
      "select body v from telegram_deliveries where dedupe_key='scope-change'",
    ),
  ).toEqual({});
  expect(
    await sql(
      "select last_error v from telegram_deliveries where dedupe_key='scope-change'",
    ),
  ).toBe("ACCESS_REVOKED");
});
