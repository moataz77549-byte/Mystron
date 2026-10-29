import "server-only";
import { cache } from "react";
import { publicDatabase } from "../supabase";
import { databaseConfigured } from "../env";
import type { SitePage } from "./site-pages-schema";
export const sitePageFields =
  "id,slug,title,description,content_json,is_published,version,updated_at";
export const publishedPage = cache(
  async (slug: string): Promise<SitePage | null> => {
    if (!databaseConfigured()) return null;
    const { data, error } = await publicDatabase()
      .from("site_pages")
      .select(sitePageFields)
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();
    // Preserve the existing about/privacy pages before the additive migration.
    if (error?.code === "42P01" || error?.code === "PGRST205") return null;
    if (error) throw new Error("تعذر تحميل الصفحة");
    return data;
  },
);
