"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminRequest, adminErrorMessage } from "@/lib/client/request";
import type { ReportPage } from "@/lib/editorial/report-schema";
const names: Record<string, string> = {
  dismissed: "أُغلق دون إجراء",
  hidden: "أُخفي التعليق",
  rejected: "رُفض التعليق",
};
export function ReportsManager({
  initial,
  status,
}: {
  initial: ReportPage;
  status: string;
}) {
  const router = useRouter();
  const active = useRef(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  async function resolve(id: string, action: string) {
    if (active.current || !confirm("تأكيد معالجة البلاغ بهذا الإجراء؟")) return;
    active.current = true;
    setBusy(id);
    setMessage("");
    try {
      await adminRequest("/api/v1/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      setMessage("حُفظ قرار المراجعة.");
      router.refresh();
    } catch (error) {
      setMessage(adminErrorMessage(error));
    } finally {
      active.current = false;
      setBusy("");
    }
  }
  return (
    <section aria-busy={!!busy}>
      <h1>بلاغات التعليقات</h1>
      <form className="form" action="/admin/reports">
        <label>
          حالة البلاغ
          <select name="status" defaultValue={status}>
            <option value="pending">بانتظار المعالجة</option>
            <option value="resolved">تمت المعالجة</option>
            <option value="all">الكل</option>
          </select>
        </label>
        <button disabled={!!busy}>عرض البلاغات</button>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {!initial.rows.length && (
        <p className="status">لا توجد بلاغات في هذه القائمة.</p>
      )}
      {initial.rows.map((row) => (
        <article className="control-card" key={row.id}>
          <h2>{row.post_title}</h2>
          <p>التعليق: {row.body}</p>
          <p>سبب البلاغ: {row.reason}</p>
          <p>
            <time dateTime={row.created_at}>
              {new Date(row.created_at).toLocaleString("ar-YE", {
                timeZone: "Asia/Aden",
              })}
            </time>
          </p>
          {row.resolved_at ? (
            <p>{names[row.resolution || ""] || "تمت المعالجة"}</p>
          ) : (
            <div className="editor-toolbar">
              <button
                disabled={!!busy}
                onClick={() => void resolve(row.id, "dismissed")}
              >
                إغلاق دون إجراء
              </button>
              <button
                disabled={!!busy}
                onClick={() => void resolve(row.id, "hidden")}
              >
                إخفاء التعليق وإغلاق البلاغ
              </button>
              <button
                disabled={!!busy}
                onClick={() => void resolve(row.id, "rejected")}
              >
                رفض التعليق وإغلاق البلاغ
              </button>
            </div>
          )}
          <Link href={"/admin/comments?status=all"}>مراجعة التعليقات</Link>
        </article>
      ))}
      <nav className="editor-toolbar" aria-label="صفحات البلاغات">
        {initial.page > 1 && (
          <Link href={`?status=${status}&page=${initial.page - 1}`}>
            السابق
          </Link>
        )}
        <span>
          الصفحة {initial.page} · {initial.total} بلاغاً
        </span>
        {initial.page * initial.page_size < initial.total && (
          <Link href={`?status=${status}&page=${initial.page + 1}`}>
            التالي
          </Link>
        )}
      </nav>
    </section>
  );
}
