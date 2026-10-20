"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminErrorMessage } from "@/lib/client/request";
import { command } from "./command";
type Comment = {
  id: string;
  guest_name: string;
  body: string;
  status: string;
  post_id: string;
  deleted_at: string | null;
};
const states: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "مقبول",
  rejected: "مرفوض",
  hidden: "مخفي",
  all: "الكل",
};
export default function Moderation({
  initial,
  page = 1,
  total = initial.length,
  filter = "pending",
}: {
  initial: Comment[];
  page?: number;
  total?: number;
  filter?: string;
}) {
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const active = useRef(false);
  const router = useRouter();
  const visible = rows.filter(
    (row) => !row.deleted_at && (filter === "all" || row.status === filter),
  );
  return (
    <section aria-busy={!!busy}>
      <h1>مراجعة التعليقات</h1>
      <Link className="button" href="/admin/reports">
        مراجعة البلاغات
      </Link>
      <form className="form" action="/admin/comments">
        <label>
          حالة التعليق
          <select name="status" defaultValue={filter}>
            {Object.entries(states).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button disabled={!!busy}>عرض التعليقات</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {visible.map((row) => (
        <article key={row.id} className="catalog-card">
          <h2>
            {row.guest_name} <small>زائر</small>
          </h2>
          <p>{row.body}</p>
          <p>الحالة: {states[row.status] || row.status}</p>
          <div className="editor-toolbar">
            {[
              ["approved", "قبول"],
              ["rejected", "رفض"],
              ["hidden", "إخفاء"],
              ["delete", "نقل للمحذوفة"],
            ].map(([action, label]) => (
              <button
                key={action}
                disabled={!!busy || row.status === action}
                onClick={async () => {
                  if (active.current) return;
                  if (
                    action === "delete" &&
                    !confirm("نقل التعليق إلى المحذوفة؟")
                  )
                    return;
                  active.current = true;
                  setBusy(row.id);
                  setError("");
                  try {
                    await command("comments", { id: row.id, action });
                    setRows((items) =>
                      items.map((item) =>
                        item.id === row.id
                          ? {
                              ...item,
                              status: action,
                              deleted_at:
                                action === "delete"
                                  ? new Date().toISOString()
                                  : null,
                            }
                          : item,
                      ),
                    );
                    router.refresh();
                  } catch (error) {
                    setError(adminErrorMessage(error));
                  } finally {
                    active.current = false;
                    setBusy("");
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </article>
      ))}
      {!visible.length && (
        <p className="status">لا توجد تعليقات مطابقة في هذه الصفحة.</p>
      )}
      <nav aria-label="صفحات التعليقات" className="editor-toolbar">
        {page > 1 && (
          <Link href={`?status=${filter}&page=${page - 1}`}>السابق</Link>
        )}
        <span>
          الصفحة {page} · {total} تعليقاً
        </span>
        {page * 25 < total && (
          <Link href={`?status=${filter}&page=${page + 1}`}>التالي</Link>
        )}
      </nav>
    </section>
  );
}
