import "server-only";
import { cache } from "react";
import { publicDatabase } from "../supabase";
import { databaseConfigured } from "../env";
export type PublicMenu = {
  id: string;
  parent_id: string | null;
  location: string;
  label: string;
  href: string;
  sort_order: number;
};
export const publicMenus = cache(async () => {
  if (!databaseConfigured()) return [] as PublicMenu[];
  const { data, error } = await publicDatabase()
    .from("menu_items")
    .select(
      "id,parent_id,location,label,target_type,href,category_id,sort_order,categories(slug)",
    )
    .order("sort_order")
    .limit(400);
  if (error) return [] as PublicMenu[];
  return (data || []).flatMap((item) => {
    const category = item.categories as unknown as { slug: string } | null;
    const href =
      item.target_type === "category"
        ? category
          ? "/categories/" + category.slug
          : null
        : item.href;
    return href && /^(https:\/\/|\/(?!\/))/.test(href)
      ? [
          {
            id: item.id,
            parent_id: item.parent_id,
            location: item.location,
            label: item.label,
            href,
            sort_order: item.sort_order,
          },
        ]
      : [];
  });
});
