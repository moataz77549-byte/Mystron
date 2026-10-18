import { pathToFileURL } from "node:url";

// Never include configured values in errors: this runs with production secrets.
export function releaseIssues(env, telegram = false) {
  const issues = [];
  for (const name of ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    try {
      const url = new URL(env[name]);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/" ||
        /^(localhost|127\.|\[::1\])/.test(url.hostname)
      )
        throw new Error();
    } catch {
      issues.push(`${name}: an HTTPS origin is required`);
    }
  }
  if (!(
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ))
    issues.push("Supabase public key: missing");
  if (!env.SUPABASE_SERVICE_ROLE_KEY)
    issues.push("SUPABASE_SERVICE_ROLE_KEY: missing");
  const names = ["PIN_PEPPER", "RATE_LIMIT_SECRET"];
  if (telegram)
    names.push("TELEGRAM_GATEWAY_SECRET", "TELEGRAM_WEBHOOK_SECRET");
  for (const name of names) {
    if (!env[name] || env[name].length < 32)
      issues.push(`${name}: at least 32 characters required`);
  }
  const values = names.map((name) => env[name]).filter(Boolean);
  if (new Set(values).size !== values.length)
    issues.push("Secrets: independent values required");
  if (env.AI_ENABLED !== "false")
    issues.push("AI_ENABLED: must remain false for this release");
  if (env.AI_API_KEY)
    issues.push("AI_API_KEY: must remain unset for this release");
  for (const flag of ["MAYSTROON_TEST_FIXTURE", "AI_ALLOW_TEST_HTTP"]) {
    if (env[flag] === "true") issues.push(`${flag}: forbidden in a release`);
  }
  if (telegram) {
    if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(env.TELEGRAM_BOT_TOKEN || ""))
      issues.push("TELEGRAM_BOT_TOKEN: missing or malformed");
    try {
      const url = new URL(env.TELEGRAM_WEBHOOK_URL);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/webhook"
      )
        throw new Error();
    } catch {
      issues.push("TELEGRAM_WEBHOOK_URL: HTTPS /webhook required");
    }
  }
  return issues;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const issues = releaseIssues(
    process.env,
    process.argv.includes("--telegram"),
  );
  if (issues.length) {
    console.error(
      "Release configuration blocked:\n" +
        issues.map((x) => "- " + x).join("\n"),
    );
    process.exitCode = 1;
  } else {
    console.log(
      "Release environment validated; deployment, database, owner verification and live smoke checks are still required.",
    );
  }
}
