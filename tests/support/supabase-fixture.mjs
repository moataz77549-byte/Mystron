import { vector } from "@electric-sql/pglite-pgvector";
// Local integration fixture only. Never deploy or point a production app here.
// Auth/Storage protocols are simulated; content authorization executes the real SQL migrations.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const db = new PGlite({ extensions: { vector } });
const bytes = new Map();
const owner = "11111111-1111-4111-8111-111111111111";
await db.exec(
  `create role anon;create role authenticated;create role authenticator;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now(),updated_at timestamptz default now(),aal text default 'aal1',not_after timestamptz);create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;grant execute on function auth.jwt() to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`,
);
for (const f of readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort())
  await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
await db.exec(
  `insert into auth.users values('${owner}','fixture-owner@example.test',now());insert into profiles(id,display_name) values('${owner}','مالك اختبار محلي');insert into user_roles(user_id,role_id) select '${owner}',id from roles where name='OWNER';insert into auth.sessions(id,user_id) values('${owner}','${owner}');update private.owner_bootstrap set completed_at=now(),user_id='${owner}';`,
);
await db.exec(
  "update ai_configuration set enabled=true,model='fixture-generation',embedding_model='fixture-embedding',streaming=true",
);
const users = new Map();
for (const [id, email, roleName] of [
  [owner, "fixture-owner@example.test", "OWNER"],
  [
    "22222222-2222-4222-8222-222222222222",
    "fixture-author@example.test",
    "AUTHOR",
  ],
  [
    "33333333-3333-4333-8333-333333333333",
    "fixture-editor@example.test",
    "EDITOR",
  ],
]) {
  if (id !== owner) {
    await db.query("insert into auth.users values($1,$2,now())", [id, email]);
    await db.query(
      "insert into user_roles(user_id,role_id) select $1,id from roles where name=$2",
      [id, roleName],
    );
  }
  users.set(email, {
    id,
    email,
    aud: "authenticated",
    role: "authenticated",
    email_confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    app_metadata: { provider: "email" },
    user_metadata: {},
  });
}
const tokens = new Map();
async function issueSession(user) {
  const sid = randomUUID();
  await db.exec("reset role");
  await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
    sid,
    user.id,
  ]);
  const claims = {
    sub: user.id,
    session_id: sid,
    iat: Math.floor(Date.now() / 1000),
    role: "authenticated",
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 86400,
  };
  const jwt = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    Buffer.from("fixture-signature-only").toString("base64url"),
  ].join(".");
  tokens.set(jwt, { user, claims });
  return jwt;
}
const ident = (s) =>
  /^\w+$/.test(s)
    ? `"${s}"`
    : (() => {
        throw Error("bad identifier");
      })();
let queue = Promise.resolve();
createServer((req, res) => {
  queue = queue
    .then(async () => {
      const url = new URL(req.url, "http://127.0.0.1:54331");
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks);
      const token = (req.headers.authorization || "").replace("Bearer ", "");
      const role =
        token === "fixture-service-role"
          ? "service_role"
          : tokens.has(token)
            ? "authenticated"
            : "anon";
      const json = (status, data, headers = {}) => {
        res.writeHead(status, {
          "Content-Type": "application/json",
          ...headers,
        });
        res.end(JSON.stringify(data));
      };
      try {
        if (url.pathname === "/health") return json(200, { fixture: true });
        if (url.pathname === "/auth/v1/token") {
          const b = JSON.parse(raw);
          const user = users.get(b.email);
          if (!user || b.password !== "Fixture-password-2026")
            return json(400, { error: "invalid_credentials" });
          const jwt = await issueSession(user);
          return json(200, {
            access_token: jwt,
            refresh_token: "fixture-refresh",
            expires_in: 86400,
            token_type: "bearer",
            user,
          });
        }
        if (url.pathname === "/auth/v1/user")
          return json(
            role === "authenticated" ? 200 : 401,
            role === "authenticated"
              ? tokens.get(token).user
              : { message: "Invalid JWT" },
          );
        if (url.pathname === "/auth/v1/logout") return json(200, {});
        await db.exec(`reset role;set role ${role}`);
        await db.query(
          "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false),set_config('request.headers',$3,false)",
          [
            role === "authenticated" ? tokens.get(token).user.id : "",
            JSON.stringify(
              role === "authenticated" ? tokens.get(token).claims : {},
            ),
            JSON.stringify({
              "x-maystroon-proof": req.headers["x-maystroon-proof"] || "",
            }),
          ],
        );
        if (url.pathname.startsWith("/storage/v1/object/")) {
          const key = decodeURIComponent(
            url.pathname.split("/object/")[1].replace(/^authenticated\//, ""),
          );
          if (req.method === "POST") {
            if (
              role !== "authenticated" ||
              !key.startsWith(`editorial/${tokens.get(token)?.user.id}/`)
            )
              return json(403, { message: "Forbidden" });
            bytes.set(key, raw);
            return json(200, { Key: key });
          }
          if (req.method === "GET") {
            if (role !== "service_role" && role !== "authenticated")
              return json(403, { message: "Forbidden" });
            const b = bytes.get(key);
            if (!b) return json(404, { message: "Missing object" });
            res.writeHead(200, { "Content-Type": "application/octet-stream" });
            res.end(b);
            return;
          }
          if (req.method === "DELETE") {
            const b = JSON.parse(raw);
            for (const k of b.prefixes || []) bytes.delete(`editorial/${k}`);
            return json(200, []);
          }
        }
        if (url.pathname.startsWith("/rest/v1/rpc/")) {
          const name = url.pathname.split("/").at(-1);
          const b = JSON.parse(raw || "{}");
          const meta = (
            await db.query(
              `select proargnames,proretset, array(select format_type(x,null) from unnest(proargtypes::oid[]) x) as types from pg_proc where pronamespace='public'::regnamespace and proname=$1`,
              [name],
            )
          ).rows[0];
          if (!meta) throw Error("RPC not found");
          const args = [];
          const binds = [];
          for (const [i, k] of (meta.proargnames || []).entries()) {
            if (!Object.hasOwn(b, k)) continue;
            binds.push(
              b[k] !== null && ["jsonb", "json"].includes(meta.types[i])
                ? JSON.stringify(b[k])
                : b[k],
            );
            args.push(`${ident(k)} => $${binds.length}::${meta.types[i]}`);
          }
          const q = await db.query(
            `select to_jsonb(public.${ident(name)}(${args.join(",")})) as data`,
            binds,
          );
          const values = q.rows.map((x) => x.data);
          return json(200, meta.proretset ? values : (values[0] ?? null));
        }
        if (!url.pathname.startsWith("/rest/v1/"))
          return json(404, { message: "Fixture path missing" });
        const table = url.pathname.split("/").at(-1);
        if (!["GET", "HEAD"].includes(req.method))
          return json(405, { message: "Use RPC" });
        let fields = url.searchParams.get("select") || "*";
        const categoryJoin = fields.includes("post_categories!inner()");
        if (categoryJoin)
          fields = fields.replace(",post_categories!inner()", "");
        const relations = [];
        fields = fields.replace(
          /(authors|roles|categories)\(([^)]+)\)/g,
          (_, name, columns) => {
            relations.push({ name, columns });
            return "__relation_" + name;
          },
        );
        let projection =
          fields === "*"
            ? "t.*"
            : fields
                .split(",")
                .filter(Boolean)
                .map((f) =>
                  f.startsWith("__relation_") ? "" : `t.${ident(f)}`,
                )
                .filter(Boolean)
                .join(",");
        for (const { name, columns } of relations) {
          const fk =
            name === "authors"
              ? "author_id"
              : name === "categories"
                ? "category_id"
                : "role_id";
          projection += `,(select jsonb_build_object(${columns
            .split(",")
            .flatMap((c) => [`'${c}'`, `r.${ident(c)}`])
            .join(
              ",",
            )}) from public.${ident(name)} r where r.id=t.${ident(fk)}) as ${ident(name)}`;
        }
        projection = projection.replace(/^,/, "");
        const binds = [];
        function condition(key, value) {
          const [op, ...parts] = value.split(".");
          const v = parts.join(".");
          const c = "t." + ident(key);
          if (op === "is")
            return `${c} is ${v === "null" ? "null" : "not null"}`;
          if (op === "in") {
            const list = v.replace(/^\(|\)$/g, "").split(",");
            const refs = list.map((x) => {
              binds.push(x);
              return "$" + binds.length;
            });
            return `${c} in (${refs.join(",")})`;
          }
          if (op === "fts") {
            binds.push(v);
            return `${c} @@ plainto_tsquery('simple',$${binds.length})`;
          }
          if (op.startsWith("wfts")) {
            binds.push(v);
            return `${c} @@ websearch_to_tsquery('simple',$${binds.length})`;
          }
          if (op.startsWith("plfts")) {
            binds.push(v);
            return `${c} @@ plainto_tsquery('simple',$${binds.length})`;
          }
          const ops = {
            eq: "=",
            gt: ">",
            gte: ">=",
            lt: "<",
            lte: "<=",
            ilike: "ilike",
            neq: "<>",
          };
          if (!ops[op]) throw Error("Filter not supported " + op);
          binds.push(v);
          return `${c} ${ops[op]} $${binds.length}`;
        }
        const where = [];
        for (const [k, v] of url.searchParams) {
          if (["select", "order", "limit", "offset"].includes(k)) continue;
          if (
            k === "post_categories.category_id" &&
            categoryJoin &&
            table === "posts"
          ) {
            if (!v.startsWith("eq."))
              throw Error("Unsupported category relation filter");
            binds.push(v.slice(3));
            where.push(
              `exists (select 1 from public.post_categories pc where pc.post_id=t.id and pc.category_id=$${binds.length})`,
            );
          } else if (k === "or") {
            where.push(
              "(" +
                v
                  .replace(/^\(|\)$/g, "")
                  .split(",")
                  .map((s) => {
                    const dot = s.indexOf(".");
                    return condition(s.slice(0, dot), s.slice(dot + 1));
                  })
                  .join(" or ") +
                ")",
            );
          } else where.push(condition(k, v));
        }
        const filter = where.length ? " where " + where.join(" and ") : "";
        const count = (
          await db.query(
            `select count(*)::int as total from public.${ident(table)} t${filter}`,
            binds,
          )
        ).rows[0].total;
        const order = (url.searchParams.get("order") || "")
          .split(",")
          .filter(Boolean)
          .map((s) => {
            const [k, dir] = s.split(".");
            return `t.${ident(k)} ${dir === "desc" ? "desc" : "asc"}`;
          });
        const limit = Math.min(
          Number(url.searchParams.get("limit") || 1000),
          1000,
        );
        const offset = Number(url.searchParams.get("offset") || 0);
        const result = await db.query(
          `select ${projection} from public.${ident(table)} t${filter}${order.length ? " order by " + order.join(",") : ""} limit ${limit} offset ${offset}`,
          binds,
        );
        const headers = {
          "Content-Range": `${offset}-${Math.max(offset, offset + result.rows.length - 1)}/${count}`,
        };
        if (req.method === "HEAD") {
          res.writeHead(200, headers);
          res.end();
          return;
        }
        if (String(req.headers.accept).includes("vnd.pgrst.object")) {
          if (result.rows.length !== 1)
            return json(
              406,
              { code: "PGRST116", details: "0 rows", message: "Not single" },
              headers,
            );
          return json(200, result.rows[0], headers);
        }
        return json(200, result.rows, headers);
      } catch (e) {
        json(400, {
          code: e.code || "FIXTURE_ERROR",
          message: e.message,
          details: null,
        });
      } finally {
        await db.exec("reset role");
      }
    })
    .catch((e) => {
      res.writeHead(500);
      res.end(JSON.stringify({ message: e.message }));
    });
}).listen(54331, "127.0.0.1", () =>
  process.stdout.write("Local Supabase protocol fixture listening on 54331\n"),
);
