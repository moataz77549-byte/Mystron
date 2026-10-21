import "server-only";
import { compatibleCatalogRead } from "./editorial/catalog-compatibility";
import { publicDatabase } from "./supabase";
export type PublicAuthor = {
  id: string;
  display_name: string;
  short_name: string | null;
  slug: string;
  bio: string | null;
  specialty?: string | null;
  country: string | null;
  city: string | null;
  website: string | null;
  links: Record<string, string>;
  avatar_asset_id: string | null;
};
export const authorFields =
  "id,display_name,short_name,slug,bio,specialty,country,city,website,links,avatar_asset_id";
export async function publicAuthor(slug: string) {
  return compatibleCatalogRead(authorFields, "specialty", (fields) =>
    publicDatabase()
      .from("authors")
      .select(fields)
      .eq("slug", slug)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle()
      .overrideTypes<PublicAuthor | null, { merge: false }>(),
  );
}
export async function publicAuthors(page: number, pageSize: number) {
  return compatibleCatalogRead(authorFields, "specialty", (fields) =>
    publicDatabase()
      .from("authors")
      .select(fields)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("display_name")
      .range((page - 1) * pageSize, page * pageSize - 1)
      .overrideTypes<PublicAuthor[], { merge: false }>(),
  );
}
export async function slugRedirect(kind: string, slug: string) {
  const { data, error } = await publicDatabase()
    .from("slug_redirects")
    .select("new_slug")
    .eq("kind", kind)
    .eq("old_slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data?.new_slug as string | undefined;
}
export async function trending(days = 7, limit = 10) {
  const { data, error } = await publicDatabase().rpc("public_view_stats", {
    p_days: days,
    p_limit: limit,
  });
  if (error) throw error;
  return data as {
    post_id: string;
    total_views: number;
    period_views: number;
  }[];
}

export async function viewCount(id: string) {
  const { data, error } = await publicDatabase().rpc("post_view_count", {
    p_post_id: id,
  });
  if (error) throw error;
  return Number(data || 0);
}

export async function articleAds(path: string) {
  const { data, error } = await publicDatabase()
    .from("ticker_items")
    .select("id,text,url,sponsored,image_asset_id,pages")
    .eq("placement", "article")
    .eq("is_active", true)
    .lte("starts_at", new Date().toISOString())
    .or("ends_at.is.null,ends_at.gt." + new Date().toISOString())
    .order("sort_order");
  if (error) throw error;
  return data.filter((x) => !x.pages?.length || x.pages.includes(path));
}
