import "server-only";
import { cache } from "react";
import { publicDatabase } from "./supabase";
import { databaseConfigured } from "./env";
import { normalizeArabic } from "./editor/document";
import { querySchema } from "./validation";
export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  image_asset_id?: string | null;
  parent_id?: string | null;
  icon?: string | null;
};
export type Post = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  cover_image: string | null;
  published_at: string;
  featured: boolean;
  reading_minutes: number;
  seo_title: string | null;
  seo_description: string | null;
  authors: { display_name: string; slug: string } | null;
  content_json: import("./editor/document").RichNode;
  subtitle: string | null;
  cover_asset_id: string | null;
  thumbnail_asset_id: string | null;
  share_asset_id: string | null;
  updated_at: string;
  canonical_url: string | null;
  tags: string[];
  sources: { title: string; url: string }[];
  allow_comments: boolean;
  comments_close_at: string | null;
  sharing: Record<string, boolean>;
};
export const publicPostFields =
  "id,title,slug,excerpt,content,cover_image,published_at,featured,reading_minutes,seo_title,seo_description,content_json,subtitle,cover_asset_id,thumbnail_asset_id,share_asset_id,updated_at,canonical_url,tags,sources,allow_comments,comments_close_at,sharing,authors(display_name,slug)";
export async function categories(): Promise<Category[]> {
  const { data, error } = await publicDatabase()
    .from("categories")
    .select("id,name,slug,description,sort_order,image_asset_id,parent_id,icon")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order");
  if (error) throw error;
  return data;
}
export async function posts(params: Record<string, string | undefined> = {}) {
  const p = querySchema.parse(params);
  const db = publicDatabase();
  let ids: string[] | undefined;
  if (p.category) {
    const { data, error } = await db
      .from("categories")
      .select("id")
      .eq("slug", p.category)
      .single();
    if (error || !data) return { data: [] as Post[], total: 0, ...p };
    const links = await db
      .from("post_categories")
      .select("post_id")
      .eq("category_id", data.id);
    if (links.error) throw links.error;
    ids = links.data.map((x) => x.post_id);
    if (!ids.length) return { data: [] as Post[], total: 0, ...p };
  }
  let query = db
    .from("posts")
    .select(publicPostFields, { count: "exact" })
    .eq("status", "published")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .lte("published_at", new Date().toISOString());
  if (ids) query = query.in("id", ids);
  if (p.author) {
    const { data: a, error: e } = await db
      .from("authors")
      .select("id")
      .eq("slug", p.author)
      .maybeSingle();
    if (e) throw e;
    if (!a) return { data: [] as Post[], total: 0, ...p };
    query = query.eq("author_id", a.id);
  }
  if (p.q)
    query = query.textSearch("search_vector", normalizeArabic(p.q), {
      type: "plain",
      config: "simple",
    });
  const { data, error, count } = await query
    .order("published_at", { ascending: p.sort === "oldest" })
    .order("id")
    .range((p.page - 1) * p.pageSize, p.page * p.pageSize - 1);
  if (error) throw error;
  return { data: data as unknown as Post[], total: count || 0, ...p };
}
export async function post(slug: string) {
  const { data, error } = await publicDatabase()
    .from("posts")
    .select(publicPostFields)
    .eq("slug", slug)
    .eq("status", "published")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .lte("published_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return data as unknown as Post | null;
}
export async function publicSettings() {
  const { data, error } = await publicDatabase()
    .from("site_settings")
    .select("key,value")
    .eq("is_public", true);
  if (error) throw error;
  return data;
}
export const homeData = cache(async () => {
  if (!databaseConfigured())
    return {
      categories: [] as Category[],
      posts: [] as Post[],
      ticker: [] as { id: string; text: string; url: string | null }[],
      state: "unconfigured",
    };
  try {
    const [cats, result, ticker] = await Promise.all([
      categories(),
      posts(),
      publicDatabase()
        .from("ticker_items")
        .select("id,text,url,pages,style,sponsored,image_asset_id")
        .eq("placement", "ticker")
        .eq("is_active", true)
        .lte("starts_at", new Date().toISOString())
        .or("ends_at.is.null,ends_at.gt." + new Date().toISOString())
        .order("sort_order"),
    ]);
    if (ticker.error) throw ticker.error;
    return {
      categories: cats,
      posts: result.data,
      ticker: ticker.data,
      state: "ready",
    };
  } catch {
    return { categories: [], posts: [], ticker: [], state: "error" };
  }
});

export async function popularPosts() {
  const db = publicDatabase();
  const { data: stats, error } = await db.rpc("public_view_stats", {
    p_days: 7,
    p_limit: 3,
  });
  if (error) throw error;
  if (!stats?.length) return [] as (Post & { views: number })[];
  const ids = stats.map((s: { post_id: string }) => s.post_id);
  const { data, error: e } = await db
    .from("posts")
    .select(publicPostFields)
    .in("id", ids);
  if (e) throw e;
  return (stats as { post_id: string; period_views: number }[])
    .filter((s) => s.period_views > 0)
    .flatMap((s) => {
      const p = (data as unknown as Post[]).find((p) => p.id === s.post_id);
      return p ? [{ ...p, views: Number(s.period_views) }] : [];
    });
}

export async function featuredPost() {
  const { data, error } = await publicDatabase()
    .from("posts")
    .select(publicPostFields)
    .eq("featured", true)
    .eq("status", "published")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as Post | null;
}
