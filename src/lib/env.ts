export const siteUrl = () =>
  new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
export function databaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
export function publicEnv() {
  if (!databaseConfigured()) throw new Error("DATABASE_NOT_CONFIGURED");
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key: (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  };
}
