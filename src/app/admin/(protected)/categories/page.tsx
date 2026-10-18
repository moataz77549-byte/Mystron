import { requireAdmin } from "@/lib/auth";
import Catalog from "@/components/editor/catalog";
export default async function Page() {
  const { db, permissions } = await requireAdmin();
  if (!permissions["categories.manage"])
    return <p>هذه الإدارة تتطلب صلاحية تحرير.</p>;
  const { data, error } = await db
    .from("categories")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("تعذر تحميل العناصر");
  return (
    <Catalog
      resource="categories"
      title="إدارة الأقسام"
      initial={data}
      fields={[
        { key: "name", label: "اسم القسم" },
        { key: "slug", label: "الرابط الدائم" },
        {
          key: "description",
          label: "الوصف",
          kind: "textarea",
          nullable: true,
        },
        { key: "sort_order", label: "الترتيب", kind: "number" },
        { key: "is_active", label: "ظاهر", kind: "boolean" },
        { key: "parent_id", label: "معرّف القسم الأب", nullable: true },
        { key: "image_asset_id", label: "معرّف الصورة", nullable: true },
        { key: "icon", label: "الأيقونة", nullable: true },
      ]}
    />
  );
}
