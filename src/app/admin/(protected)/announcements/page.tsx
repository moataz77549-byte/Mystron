import { requireAdmin } from "@/lib/auth";
import { controlRead } from "@/lib/control/service";
import { AnnouncementsEditor } from "@/components/control/announcements";
import { DataTable, Pagination } from "@/components/control/table";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const identity = await requireAdmin();
  if (!identity.permissions["announcements.manage"])
    return <p>لا تملك صلاحية إدارة الإعلانات.</p>;
  const q = await searchParams;
  const data = await controlRead(
    "announcements",
    new URLSearchParams(q.page ? { page: q.page } : {}),
  );
  const assets = await identity.db
    .from("media_assets")
    .select("id,display_name")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  return (
    <>
      <h1>الشريط والإعلانات والتنبيهات</h1>
      <AnnouncementsEditor items={data.rows} assets={assets.data || []} />
      <DataTable
        rows={data.rows}
        columns={[
          ["text", "النص"],
          ["placement", "الموضع"],
          ["is_active", "مفعّل"],
          ["starts_at", "البداية UTC"],
          ["ends_at", "النهاية UTC"],
          ["sponsored", "مدفوع"],
        ]}
      />
      <Pagination
        page={Number(q.page || 1)}
        total={data.total}
        path="/admin/announcements"
      />
    </>
  );
}
