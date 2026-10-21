import { requireAdmin } from "@/lib/auth";
import Catalog from "@/components/editor/catalog";
export default async function Page() {
  const { db, permissions } = await requireAdmin();
  if (!permissions["authors.manage"])
    return <p>هذه الإدارة تتطلب صلاحية تحرير.</p>;
  const { data, error } = await db
    .from("authors")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("تعذر تحميل العناصر");
  return (
    <Catalog
      resource="authors"
      title="إدارة الكتّاب"
      initial={data}
      fields={[
        { key: "display_name", label: "اسم الكاتب" },
        { key: "short_name", label: "الاسم المختصر", nullable: true },
        { key: "slug", label: "الرابط الدائم" },
        { key: "bio", label: "النبذة", kind: "textarea", nullable: true },
        { key: "specialty", label: "التخصص", nullable: true },
        { key: "country", label: "الدولة", nullable: true },
        { key: "city", label: "المدينة", nullable: true },
        { key: "website", label: "الموقع الإلكتروني", nullable: true },
        {
          key: "links",
          label: "روابط التواصل: مفتاح ورابط HTTP/HTTPS",
          kind: "json",
        },
        { key: "is_active", label: "ظاهر", kind: "boolean" },
        { key: "sort_order", label: "الترتيب", kind: "number" },
        { key: "avatar_asset_id", label: "معرّف الصورة", nullable: true },
      ]}
    />
  );
}
