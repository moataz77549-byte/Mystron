import type { MetadataRoute } from "next";
import { siteUrl, databaseConfigured } from "@/lib/env";
import { publicDatabase } from "@/lib/supabase";
import { categories, posts } from "@/lib/content";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = ["/", "/about", "/privacy"].map((path) => ({
    url: new URL(path, siteUrl()).href,
  }));
  if (!databaseConfigured()) return base;
  const cats = await categories();
  let page = 1;
  let total = Infinity;
  let seen = 0;
  const articles: MetadataRoute.Sitemap = [];
  while (seen < total && page <= 10000) {
    const r = await posts({ page: String(page), pageSize: "50" });
    total = r.total;
    seen += r.data.length;
    articles.push(
      ...r.data.map((p) => ({
        url: new URL("/posts/" + p.slug, siteUrl()).href,
        lastModified: p.updated_at || p.published_at,
      })),
    );
    if (!r.data.length) break;
    page++;
  }
  const writers = await publicDatabase()
    .from("authors")
    .select("slug")
    .eq("is_active", true)
    .is("deleted_at", null)
    .throwOnError();
  return [
    ...writers.data.map((a) => ({
      url: new URL("/authors/" + a.slug, siteUrl()).href,
    })),
    ...base,
    ...cats.map((c) => ({
      url: new URL("/categories/" + c.slug, siteUrl()).href,
    })),
    ...articles,
  ];
}

export const dynamic = "force-dynamic";
