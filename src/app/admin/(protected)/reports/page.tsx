import { requirePermission } from "@/lib/auth";
import { ReportsManager } from "@/components/editor/reports";
import { reportQuery, type ReportPage } from "@/lib/editorial/report-schema";
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { db } = await requirePermission("comments.moderate");
  const parsed = reportQuery.safeParse(await searchParams);
  if (!parsed.success) return <p role="alert">فلاتر البلاغات غير صالحة.</p>;
  const { page, status } = parsed.data;
  const result = await db.rpc("admin_report_list", {
    p_page: page,
    p_status: status,
  });
  if (result.error)
    return (
      <p role="alert">
        تعذر تحميل البلاغات. تحقق من تحديث قاعدة البيانات واتصال الخدمة.
      </p>
    );
  return (
    <ReportsManager
      key={page + ":" + status}
      initial={result.data as ReportPage}
      status={status}
    />
  );
}
