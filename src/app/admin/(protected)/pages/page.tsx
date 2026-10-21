import { requirePermission } from "@/lib/auth";
import { SitePagesEditor } from "@/components/editor/site-pages";
import { sitePageFields } from "@/lib/editorial/site-pages";
export default async function Pages() {
  const { db, permissions } = await requirePermission("settings.read");
  const { data, error } = await db
    .from("site_pages")
    .select(sitePageFields)
    .order("updated_at", { ascending: false });
  if (error)
    throw new Error("تعذر تحميل الصفحات؛ تحقق من تطبيق تحديث قاعدة البيانات.");
  return (
    <>
      <h1>الصفحات الثابتة</h1>
      <p>
        حرّر صفحات المنصة، واحفظها كمسودة أو انشرها. روابط الصفحات ثابتة بعد
        الإنشاء.
      </p>
      <SitePagesEditor
        initial={data || []}
        editable={!!permissions["settings.update"]}
      />
    </>
  );
}
