import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
export default async function Page() {
  const { db } = await requireAdmin();
  const { data, error } = await db
    .from("posts")
    .select("id,title,scheduled_at,last_schedule_error,schedule_attempts")
    .eq("status", "scheduled")
    .is("deleted_at", null)
    .order("updated_at")
    .limit(100);
  if (error) throw new Error("تعذر تحميل التدوينات");
  return (
    <>
      <h1>النشر المجدول</h1>
      <p>التوقيت المعروض: عدن (UTC+3). تغيير الموعد أو إلغاؤه من المحرر.</p>
      {data.map((p) => (
        <article key={p.id} className="catalog-card">
          <Link href={`/admin/posts/${p.id}/edit`}>{p.title}</Link>
          {p.scheduled_at && (
            <time>
              {new Date(p.scheduled_at).toLocaleString("ar-YE", {
                timeZone: "Asia/Aden",
              })}
            </time>
          )}
          {p.last_schedule_error && (
            <p>
              آخر خطأ: {p.last_schedule_error} · محاولات {p.schedule_attempts}
            </p>
          )}
        </article>
      ))}
      {!data.length && <p>لا توجد تدوينات في هذا الطابور.</p>}
    </>
  );
}
