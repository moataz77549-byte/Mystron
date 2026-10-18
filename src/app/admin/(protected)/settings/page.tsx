import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { SettingsEditor } from "@/components/control/settings";
import { settingSchemas, type SettingKey } from "@/lib/control/settings-schema";
const tabs = [
  ["general", "عام"],
  ["identity", "الهوية البصرية"],
  ["home", "الصفحة الرئيسية"],
  ["menus", "القوائم والأقسام"],
  ["publishing", "النشر"],
  ["comments", "التعليقات"],
  ["seo", "SEO"],
  ["media", "الوسائط"],
  ["announcements", "الإعلانات"],
  ["security", "الأمان"],
  ["integrations", "التكاملات"],
  ["maintenance", "الصيانة"],
];
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const identity = await requireAdmin();
  if (!identity.permissions["settings.read"])
    return <p>لا تملك صلاحية عرض الإعدادات.</p>;
  const query = await searchParams;
  const tab = (
    query.tab === "general"
      ? "identity"
      : query.tab && query.tab in settingSchemas
        ? query.tab
        : "identity"
  ) as SettingKey;
  const [settings, assets, categories, posts] = await Promise.all([
    identity.db
      .from("site_settings")
      .select("key,value,version")
      .in("key", Object.keys(settingSchemas)),
    identity.db
      .from("media_assets")
      .select("id,display_name")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
    identity.db
      .from("categories")
      .select("id,name")
      .is("deleted_at", null)
      .order("sort_order"),
    identity.db
      .from("posts")
      .select("id,title")
      .eq("status", "published")
      .eq("visibility", "public")
      .is("deleted_at", null)
      .order("published_at", { ascending: false })
      .limit(100),
  ]);
  if (settings.error) throw new Error("تعذّر تحميل الإعدادات");
  return (
    <>
      <h1>إعدادات المنصة</h1>
      <nav className="control-tabs" aria-label="أقسام الإعدادات">
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            aria-current={key === tab ? "page" : undefined}
            href={
              key === "menus"
                ? "/admin/menus"
                : key === "announcements"
                  ? "/admin/announcements"
                  : key === "integrations"
                    ? "/admin/integrations"
                    : "/admin/settings?tab=" + key
            }
          >
            {label}
          </Link>
        ))}
      </nav>
      <SettingsEditor
        key={tab + (query.tab || "")}
        group={query.tab === "general" ? "general" : "appearance"}
        rows={settings.data || []}
        tab={tab}
        permissions={Object.keys(identity.permissions)}
        assets={assets.data || []}
        categories={categories.data || []}
        posts={posts.data || []}
      />
    </>
  );
}
