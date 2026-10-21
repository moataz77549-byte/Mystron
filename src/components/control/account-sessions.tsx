"use client";
import { useRef, useState } from "react";
import { adminRequest, adminErrorMessage } from "@/lib/client/request";
import type { AccountSessionPage } from "@/lib/editorial/account-sessions";
const date = (value: string) =>
  new Date(value).toLocaleString("ar-YE", { timeZone: "Asia/Aden" });
export function AccountSessions({ initial }: { initial: AccountSessionPage }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef(false);
  async function load(page: number) {
    const result = await adminRequest<{ data: AccountSessionPage }>(
      "/api/v1/admin/account/sessions?page=" + page,
    );
    setData(result.data);
  }
  async function run(action: () => Promise<void>) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(adminErrorMessage(error));
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return (
    <section aria-busy={busy}>
      <h1>جلساتي الإدارية</h1>
      <p>
        يمكنك عرض جلسات حسابك فقط وإبطال وصول جلسة أخرى إلى الإدارة. لا يعرض هذا
        السجل رموز الدخول. لإنهاء الجلسة الحالية استخدم تسجيل الخروج.
      </p>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {!data.rows.length && (
        <p className="status">لا توجد جلسات في هذه الصفحة.</p>
      )}
      <div className="catalog-grid">
        {data.rows.map((row) => (
          <article className="control-card" key={row.id}>
            <h2>{row.is_current ? "الجلسة الحالية" : "جلسة أخرى"}</h2>
            <p>
              الإنشاء:{" "}
              <time dateTime={row.created_at}>{date(row.created_at)}</time>
            </p>
            <p>
              آخر تحديث:{" "}
              <time dateTime={row.updated_at}>{date(row.updated_at)}</time>
            </p>
            {row.expires_at && (
              <p>
                الانتهاء:{" "}
                <time dateTime={row.expires_at}>{date(row.expires_at)}</time>
              </p>
            )}
            {row.revoked_at ? (
              <p>أُبطل الوصول الإداري: {date(row.revoked_at)}</p>
            ) : (
              !row.is_current && (
                <button
                  disabled={busy}
                  onClick={() => {
                    if (!confirm("إبطال وصول هذه الجلسة إلى الإدارة؟")) return;
                    void run(async () => {
                      await adminRequest("/api/v1/admin/account/sessions", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: row.id }),
                      });
                      await load(data.page);
                      setMessage("أُبطل وصول الجلسة إلى الإدارة.");
                    });
                  }}
                >
                  إبطال الوصول الإداري
                </button>
              )
            )}
          </article>
        ))}
      </div>
      <nav className="editor-toolbar" aria-label="صفحات الجلسات">
        <button
          disabled={busy || data.page <= 1}
          onClick={() => void run(() => load(data.page - 1))}
        >
          السابق
        </button>
        <span>
          الصفحة {data.page} · {data.total} جلسة
        </span>
        <button
          disabled={busy || data.page * data.page_size >= data.total}
          onClick={() => void run(() => load(data.page + 1))}
        >
          التالي
        </button>
      </nav>
      <form action="/auth/logout" method="post">
        <button className="button" disabled={busy}>
          تسجيل الخروج
        </button>
      </form>
    </section>
  );
}
