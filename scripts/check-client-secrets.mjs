import { readdirSync, readFileSync } from "node:fs";
function walk(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path + "/" + e.name) : [path + "/" + e.name],
  );
}
const names = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "PIN_PEPPER",
  "RATE_LIMIT_SECRET",
  "AI_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_GATEWAY_SECRET",
  "CRON_SECRET",
];
const needles = [...names, ...names.map((n) => process.env[n]).filter(Boolean)];
const leaked = walk(".next/static")
  .filter((p) => /\.(js|map|json)$/.test(p))
  .filter((p) => needles.some((n) => readFileSync(p, "utf8").includes(n)));
if (leaked.length) {
  console.error("Server secret references found in browser artifacts:", leaked);
  process.exit(1);
}
console.log("Browser artifact secret boundary: passed");
