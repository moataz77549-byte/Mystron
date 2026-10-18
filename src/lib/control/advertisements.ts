import "server-only";
import { publicDatabase } from "../supabase";
import { databaseConfigured } from "../env";
import { cache } from "react";
export const publicAdvertisements = cache(async () => {
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
});
