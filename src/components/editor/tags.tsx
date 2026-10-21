"use client";
import { useRef, useState } from "react";
import { adminRequest, adminErrorMessage } from "@/lib/client/request";
import type { TagPage } from "@/lib/editorial/tag-schema";
export function TagsManager({
  initial,
  canUpdate,
}: {
  initial: TagPage;
  canUpdate: boolean;
}) {
  const [data, setData] = useState(initial);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<TagPage["rows"][number] | null>(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef(false);
  async function load(page: number, q: string) {
    const result = await adminRequest<{ data: TagPage }>(
      "/api/v1/admin/tags?" + new URLSearchParams({ page: String(page), q }),
    );
    setData(result.data);
    setSearch(q);
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
      <h1>إدارة الوسوم</h1>
      <p>
        تُستخرج الوسوم من المقالات الفعلية ضمن نطاق صلاحياتك. إعادة التسمية
        والدمج يؤثران فقط في المقالات التي يمكنك تعديلها؛ تبقى النسخ السابقة
        قابلة للاستعادة.
      </p>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => load(1, query));
        }}
      >
        <label>
          البحث في الوسوم
          <input
            value={query}
            maxLength={80}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button disabled={busy}>بحث</button>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {source && (
        <form
          className="control-card form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!target.trim() || target.trim() === source.tag) return;
            if (
              !confirm(
                "تأكيد تعديل " +
                  source.editable_posts +
                  " مقالاً من الوسم «" +
                  source.tag +
                  "» إلى «" +
                  target.trim() +
                  "»؟",
              )
            )
              return;
            void run(async () => {
              const result = await adminRequest<{ data: { updated: number } }>(
                "/api/v1/admin/tags",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    source: source.tag,
                    target: target.trim(),
                    expected_count: source.editable_posts,
                  }),
                },
              );
              setSource(null);
              setTarget("");
              setMessage("تم تحديث " + result.data.updated + " مقالاً.");
              await load(1, search);
            });
          }}
        >
          <h2>تعديل الوسم: {source.tag}</h2>
          <p>
            عند وجود الوسم الجديد يُدمج التكرار تلقائياً. الحد الأقصى للعملية
            500 مقال.
          </p>
          <label>
            الوسم الجديد
            <input
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              maxLength={80}
              required
            />
          </label>
          <button
            disabled={busy || !target.trim() || target.trim() === source.tag}
          >
            تأكيد إعادة التسمية أو الدمج
          </button>
          <button type="button" disabled={busy} onClick={() => setSource(null)}>
            إلغاء
          </button>
        </form>
      )}
      <div className="catalog-grid">
        {data.rows.map((row) => (
          <article className="control-card" key={row.tag}>
            <h2>{row.tag}</h2>
            <p>
              {row.posts} مقالاً · يمكنك تعديل {row.editable_posts}
            </p>
            {canUpdate && (
              <button
                disabled={
                  busy || row.editable_posts < 1 || row.editable_posts > 500
                }
                onClick={() => {
                  setSource(row);
                  setTarget("");
                }}
              >
                إعادة تسمية أو دمج
              </button>
            )}
          </article>
        ))}
      </div>
      {!data.rows.length && (
        <p className="status">
          لا توجد وسوم مطابقة. يمكنك إضافة الوسوم أثناء تحرير المقال.
        </p>
      )}
      <nav aria-label="صفحات الوسوم" className="editor-toolbar">
        <button
          disabled={busy || data.page <= 1}
          onClick={() => void run(() => load(data.page - 1, search))}
        >
          السابق
        </button>
        <span>
          الصفحة {data.page} · {data.total} وسماً
        </span>
        <button
          disabled={busy || data.page * data.page_size >= data.total}
          onClick={() => void run(() => load(data.page + 1, search))}
        >
          التالي
        </button>
      </nav>
    </section>
  );
}
