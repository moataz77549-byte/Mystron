import Link from "next/link";
import { CalendarClock, FilePenLine, PenLine } from "lucide-react";
import type { authorizedUser } from "@/lib/auth";
type Identity = NonNullable<Awaited<ReturnType<typeof authorizedUser>>>;
const labels: Record<string, string> = {
  draft: "مسودة",
  review: "قيد المراجعة",
  scheduled: "مجدولة",
  published: "منشورة",
  unpublished: "غير منشورة",
  archived: "مؤرشفة",
};
export async function DashboardEditorial({ identity }: { identity: Identity }) {
  if (!identity.permissions["posts.read"]) return null;
  const [recent, upcoming] = await Promise.all([
    identity.db
      .from("posts")
      .select("id,title,status,updated_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(6),
    identity.permissions["posts.schedule"]
      ? identity.db
          .from("posts")
          .select("id,title,scheduled_at,last_schedule_error")
          .eq("status", "scheduled")
          .is("deleted_at", null)
          .order("scheduled_at")
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
  ]);
  return (
    <div className="dashboard-editorial control-grid">
      <section className="control-card">
        <h2>
          <FilePenLine size={21} aria-hidden="true" /> آخر المقالات
        </h2>
        {recent.error ? (
          <p role="alert">تعذر تحميل المقالات. حاول تحديث الصفحة.</p>
        ) : recent.data?.length ? (
          <ul className="editorial-recent-list">
            {recent.data.map((post) => (
              <li key={post.id}>
                <Link href={`/admin/posts/${post.id}/edit`}>{post.title}</Link>
                <span className="status-badge">
                  {labels[post.status] || post.status}
                </span>
                <time dateTime={post.updated_at}>
                  {new Date(post.updated_at).toLocaleDateString("ar-YE", {
                    timeZone: "Asia/Aden",
                  })}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <div className="editorial-empty">
            <PenLine size={34} aria-hidden="true" />
            <h3>صفحة جديدة تنتظر سطورك</h3>
            <p>
              لا توجد مقالات بعد. ابدأ بفكرة، واحفظها مسودة حتى تصبح جاهزة
              للنشر.
            </p>
            {identity.permissions["posts.create"] && (
              <Link className="button" href="/admin/posts/new">
                إضافة المقال الأول
              </Link>
            )}
          </div>
        )}
        {!!recent.data?.length && (
          <Link href="/admin/posts">عرض جميع المقالات ←</Link>
        )}
      </section>
      {identity.permissions["posts.schedule"] && (
        <section className="control-card">
          <h2>
            <CalendarClock size={21} aria-hidden="true" /> جدول النشر القادم
          </h2>
          <p className="muted">المواعيد بتوقيت عدن · UTC+3</p>
          {upcoming.error ? (
            <p role="alert">تعذر تحميل قائمة النشر.</p>
          ) : upcoming.data?.length ? (
            <ul className="editorial-recent-list">
              {upcoming.data.map((post) => (
                <li key={post.id}>
                  <Link href={`/admin/posts/${post.id}/edit`}>
                    {post.title}
                  </Link>
                  <time dateTime={post.scheduled_at}>
                    {new Date(post.scheduled_at).toLocaleString("ar-YE", {
                      timeZone: "Asia/Aden",
                    })}
                  </time>
                  {post.last_schedule_error && (
                    <span className="error">
                      تعذر آخر تنفيذ؛ راجع الموعد وحالة المقال.
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="editorial-empty">
              <CalendarClock size={32} aria-hidden="true" />
              <p>لا توجد مقالات مجدولة حالياً.</p>
              <Link href="/admin/scheduled">فتح إدارة الجدولة</Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
