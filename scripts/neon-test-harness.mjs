// Supplemental SQL testing only. Never changes application credentials or Supabase.
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PENDING } from "./db-release.mjs";

export const NEON_TEST_TARGET = Object.freeze({
  project_id: "dawn-cherry-68687091",
  branch_id: "br-autumn-hat-am7i09m0",
  database_name: "maystroon_test",
});

// Neon HTTP queries use prepared statements: each must contain one SQL statement.
// Preserve function bodies, quoted semicolons and comments without rewriting SQL.
export function splitPostgresSql(sql) {
  const statements = [];
  let start = 0,
    quote = "",
    dollar = "",
    block = 0,
    line = false;
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i],
      next = sql[i + 1];
    if (line) {
      if (char === "\n") line = false;
      continue;
    }
    if (block) {
      if (char === "/" && next === "*") {
        block++;
        i++;
      } else if (char === "*" && next === "/") {
        block--;
        i++;
      }
      continue;
    }
    if (dollar) {
      if (sql.startsWith(dollar, i)) {
        i += dollar.length - 1;
        dollar = "";
      }
      continue;
    }
    if (quote) {
      if (quote === "E" && char === "\\") {
        i++;
        continue;
      }
      const delimiter = quote === "E" ? "'" : quote;
      if (char === delimiter) {
        if (next === delimiter) i++;
        else quote = "";
      }
      continue;
    }
    if (char === "-" && next === "-") {
      line = true;
      i++;
    } else if (char === "/" && next === "*") {
      block = 1;
      i++;
    } else if (char === "'" || char === '"') {
      quote =
        char === "'" && /(?:^|\W)[eE]$/.test(sql.slice(0, i)) ? "E" : char;
    } else if (char === "$") {
      const tag = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0];
      if (tag) {
        dollar = tag;
        i += tag.length - 1;
      }
    } else if (char === ";") {
      const statement = sql.slice(start, i).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
  }
  if (quote || dollar || block)
    throw new Error("Unterminated PostgreSQL input");
  const tail = sql.slice(start).trim();
  if (tail && !/^--[^\n]*$/.test(tail)) statements.push(tail);
  return statements;
}

export async function migrationBatch(start, end) {
  const directory = resolve(import.meta.dirname, "../supabase/migrations");
  const files = (await readdir(directory))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (
    files.length !== 55 ||
    JSON.stringify(files.slice(49)) !== JSON.stringify(PENDING)
  )
    throw new Error(
      "Expected exactly 49 baseline and six pending migration files",
    );
  const sql_statements = [],
    evidence = [];
  for (let i = start; i < end; i++) {
    const filename = files[i],
      sql = await readFile(resolve(directory, filename), "utf8");
    const sha256 = createHash("sha256").update(sql).digest("hex");
    const omitted = [];
    for (const statement of splitPostgresSql(sql)) {
      // Only provider-specific configuration may be omitted; never application SQL.
      if (
        filename === "20261013230449_configure_public_data_api.sql" &&
        statement.replace(/^--[^\n]*\n/, "").trim() ===
          "alter role authenticator set pgrst.db_schemas = 'public,graphql_public'"
      ) {
        omitted.push(
          "PostgREST pgrst.db_schemas configuration is Supabase-only",
        );
      } else sql_statements.push(statement);
    }
    // A separate test ledger is deliberate: this is not a production migration run.
    sql_statements.push(
      `insert into maystroon_test_harness.migration_runs(version,filename,sha256,phase,provider_omissions) values ('${filename.slice(0, 14)}','${filename}','${sha256}','${i < 49 ? "baseline" : "pending"}',ARRAY[${omitted.map((reason) => "'" + reason + "'").join(",")}]::text[])`,
    );
    evidence.push({ filename, sha256, omitted });
  }
  return { ...NEON_TEST_TARGET, sql_statements, evidence };
}

export async function acceptanceBatch() {
  const path = resolve(import.meta.dirname, "sql/release-acceptance.sql");
  const sql = (await readFile(path, "utf8")).replace(/^\\set.*$/gm, "");
  const statements = splitPostgresSql(sql);
  if (statements.pop()?.trim() !== "rollback")
    throw new Error("Expected rollback acceptance suite");
  return {
    ...NEON_TEST_TARGET,
    sql_statements: [
      "savepoint cms_acceptance",
      ...statements,
      "rollback to savepoint cms_acceptance",
      "release savepoint cms_acceptance",
    ],
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  console.log(
    JSON.stringify(
      await migrationBatch(Number(process.argv[2]), Number(process.argv[3])),
    ),
  );
}
