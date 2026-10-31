import "server-only";
import { publicDatabase } from "../supabase";
import { databaseConfigured } from "../env";
import { cache } from "react";
import { unstable_cache } from "next/cache";
const readPublicAdvertisements = async () => {
  if (!databaseConfigured()) return [];
  const { data, error } = await publicDatabase()
    .from("ticker_items")
    .select("id,text,url,sponsored,image_asset_id,pages,placement,style")
    .neq("placement", "ticker")
    .eq("is_active", true)
    .lte("starts_at", new Date().toISOString())
    .or("ends_at.is.null,ends_at.gt." + new Date().toISOString())
    .order("sort_order")
    .limit(100);
  return error ? [] : data || [];
};
export const publicAdvertisements = cache(
  unstable_cache(readPublicAdvertisements, ["publicAdvertisements-v1"], {
    revalidate: 30,
    tags: ["public-content"],
  }),
);
