"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { FileText, Plus, Search } from "lucide-react";
import { command } from "./command";
import { adminErrorMessage, adminRequest } from "@/lib/client/request";
import {
  postLabels,
  postSorts,
  postStates,
  type PostQuery,
} from "@/lib/editorial/post-query";
type Row = {
  id: string;
  title: string;
  slug: string;
  status: string;
  version: number;
  deleted_at: string | null;
  updated_at: string;
  author_name?: string;
  category_name?: string;
  views?: number | null;
  thumbnail_asset_id?: string | null;
  can_update?: boolean;
  can_delete?: boolean;
  can_publish?: boolean;
  can_schedule?: boolean;
  can_duplicate?: boolean;
};
type Choice = { id: string; name: string };
const actionLabels: Record<string, string> = {
  review: "إرسال للمراجعة",
  publish: "نشر",
  unpublished: "إلغاء النشر",
  archived: "أرشفة",
  delete: "حذف آمن",
  restore: "استعادة",
  duplicate: "نسخ إلى مسودة",
};
function mayAct(row: Row, action: string) {
  return ["publish", "unpublished", "archived"].includes(action)
    ? !!row.can_publish
    : ["delete", "restore"].includes(action)
      ? !!row.can_delete
      : action === "duplicate"
        ? !!row.can_duplicate
        : !!row.can_update;
}
export default function PostList({
  initial,
  initialTotal,
  initialQuery,
  authors,
  categories,
  publisher,
  create = true,
  analytics = false,
}: {
  initial: Row[];
  initialTotal: number;
  initialQuery: PostQuery;
  authors: Choice[];
  categories: Choice[];
  publisher: boolean;
  create?: boolean;
  analytics?: boolean;
}) {
  const [rows, setRows] = useState(initial),
    [total, setTotal] = useState(initialTotal);
  const [query, setQuery] = useState(initialQuery),
    [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState("");
  const [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const mutation = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({
        resource: "posts",
        ...Object.fromEntries(
          Object.entries(query).map(([key, value]) => [key, String(value)]),
        ),
      });
      void adminRequest<{ data: Row[]; total: number }>(
        "/api/v1/admin/data?" + params,
        { signal: abort.signal },
      )
        .then((result) => {
          if (abort.signal.aborted) return;
          const lastPage = Math.max(
            1,
            Math.ceil(result.total / query.page_size),
          );
          if (query.page > lastPage) {
            setQuery((old) => ({ ...old, page: lastPage }));
            return;
          }
          setRows(result.data);
          setTotal(result.total);
          setSelected([]);
          setError("");
        })
        .catch((e) => {
          if (!abort.signal.aborted) setError(adminErrorMessage(e));
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, refresh]);
  function filter(key: keyof PostQuery, value: string) {
    setQuery((old) => ({
      ...old,
      [key]: key === "page_size" ? Number(value) : value,
      page: 1,
    }));
  }
  async function act(action: string, row?: Row) {
    if (mutation.current) return;
    if (
      action === "delete" &&
      !confirm(
        row
          ? `نقل «${row.title}» إلى المحذوفة مؤقتاً؟`
          : `نقل ${selected.length} مقالات إلى المحذوفة مؤقتاً؟`,
      )
    )
      return;
    mutation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (row)
        await command("transitions", {
          id: row.id,
          version: row.version,
          action,
        });
      else
        await command("bulk", {
          items: rows
            .filter((item) => selected.includes(item.id))
            .map(({ id, version }) => ({ id, version })),
          action,
        });
      setSelected([]);
      setNotice("تم تنفيذ العملية وحفظها على الخادم.");
      setRefresh((value) => value + 1);
    } catch (e) {
      setError(adminErrorMessage(e));
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  const pages = Math.max(1, Math.ceil(total / query.page_size));
  return (
    <section className="posts-manager" aria-busy={loading || busy}>
      <div className="editorial-page-heading">
        <div>
          <span className="eyebrow">MAYSTROON · إدارة المحتوى</span>
          <h1>المقالات والتدوينات</h1>
          <p>{total.toLocaleString("ar-YE")} مقالاً ضمن الفلاتر الحالية</p>
        </div>
        {create && (
          <Link className="button" href="/admin/posts/new">
            <Plus size={18} aria-hidden="true" /> تدوينة جديدة
          </Link>
        )}
      </div>
      <div className="post-filters control-card">
        <label className="post-search">
          <Search size={17} aria-hidden="true" /> البحث في التدوينات
          <input
            value={query.q}
            maxLength={100}
            placeholder="عنوان، كلمة أو عبارة…"
            onChange={(e) => filter("q", e.target.value)}
          />
        </label>
        <label>
          حالة التدوينة
          <select
            value={query.status}
            onChange={(e) => filter("status", e.target.value)}
          >
            <option value="">كل الحالات النشطة</option>
            {postStates.map((state) => (
              <option key={state} value={state}>
                {postLabels[state]}
              </option>
            ))}
          </select>
        </label>
        <label>
          الكاتب
          <select
            value={query.author_id}
            onChange={(e) => filter("author_id", e.target.value)}
          >
            <option value="">جميع الكتّاب</option>
            {authors.map((author) => (
              <option key={author.id} value={author.id}>
                {author.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          القسم
          <select
            value={query.category_id}
            onChange={(e) => filter("category_id", e.target.value)}
          >
            <option value="">جميع الأقسام</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          الترتيب
          <select
            value={query.sort}
            onChange={(e) => filter("sort", e.target.value)}
          >
            {Object.entries(postSorts)
              .filter(([key]) => key !== "views" || analytics)
              .map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
          </select>
        </label>
        <label>
          من تاريخ التعديل (UTC)
          <input
            type="date"
            value={query.from}
            onChange={(e) => filter("from", e.target.value)}
          />
        </label>
        <label>
          إلى تاريخ التعديل (UTC)
          <input
            type="date"
            value={query.to}
            onChange={(e) => filter("to", e.target.value)}
          />
        </label>
        <label>
          حجم الصفحة
          <select
            value={query.page_size}
            onChange={(e) => filter("page_size", e.target.value)}
          >
            {[25, 50, 100].map((size) => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {loading && <p role="status">جارٍ تحميل المقالات…</p>}
      {selected.length > 0 && (
        <div
          className="post-bulk editor-toolbar"
          aria-label="العمليات الجماعية"
        >
          <strong>{selected.length} محددة</strong>
          {(publisher
            ? [
                "review",
                "publish",
                "unpublished",
                "archived",
                "delete",
                "restore",
              ]
            : ["review", "delete"]
          ).map((action) => (
            <button
              key={action}
              disabled={
                busy ||
                loading ||
                selected.length > 50 ||
                rows
                  .filter((row) => selected.includes(row.id))
                  .some((row) => !mayAct(row, action))
              }
              onClick={() => void act(action)}
            >
              {actionLabels[action]}
            </button>
          ))}
          {selected.length > 50 && <p>اختر حتى 50 مقالاً للعملية الواحدة.</p>}
        </div>
      )}
      {rows.length ? (
        <div className="post-table-wrap">
          <table className="post-card-table" role="table">
            <thead>
              <tr>
                <th>
                  <input
                    aria-label="اختيار جميع مقالات الصفحة"
                    type="checkbox"
                    checked={
                      rows.length > 0 &&
                      rows.every((row) => selected.includes(row.id))
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? rows.map((row) => row.id) : [],
                      )
                    }
                  />
                </th>
                <th>المقال</th>
                <th>الكاتب والقسم</th>
                <th>الحالة</th>
                <th>آخر تعديل</th>
                <th>المشاهدات</th>
                <th>العمليات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input
                      aria-label={`اختيار ${row.title}`}
                      type="checkbox"
                      checked={selected.includes(row.id)}
                      onChange={(e) =>
                        setSelected((old) =>
                          e.target.checked
                            ? [...old, row.id]
                            : old.filter((id) => id !== row.id),
                        )
                      }
                    />
                  </td>
                  <td data-label="المقال">
                    <div className="post-title-cell">
                      {row.thumbnail_asset_id ? (
                        <Image
                          src={`/api/v1/admin/media/${row.thumbnail_asset_id}?variant=optimized`}
                          width={60}
                          height={48}
                          alt=""
                          unoptimized
                        />
                      ) : (
                        <span className="post-thumb-placeholder">
                          <FileText size={22} aria-hidden="true" />
                        </span>
                      )}
                      <Link href={`/admin/posts/${row.id}/edit`}>
                        {row.title}
                      </Link>
                    </div>
                  </td>
                  <td data-label="الكاتب والقسم">
                    <span>{row.author_name || "دون كاتب"}</span>
                    <small>{row.category_name || "دون قسم أساسي"}</small>
                  </td>
                  <td data-label="الحالة">
                    <span
                      className={`status-badge status-${row.deleted_at ? "trash" : row.status}`}
                    >
                      {postLabels[row.deleted_at ? "trash" : row.status] ||
                        row.status}
                    </span>
                  </td>
                  <td data-label="آخر تعديل">
                    <time dateTime={row.updated_at}>
                      {new Date(row.updated_at).toLocaleDateString("ar-YE", {
                        timeZone: "Asia/Aden",
                      })}
                    </time>
                  </td>
                  <td data-label="المشاهدات">
                    {row.views == null
                      ? "—"
                      : row.views.toLocaleString("ar-YE")}
                  </td>
                  <td data-label="العمليات">
                    <details className="post-row-actions">
                      <summary>إجراءات المقال</summary>
                      <div>
                        <Link href={`/admin/posts/${row.id}/edit`}>
                          {row.can_update ? "تحرير ومعاينة" : "فتح للاطلاع"}
                        </Link>
                        {row.can_schedule && !row.deleted_at && (
                          <Link href={`/admin/posts/${row.id}/edit#publishing`}>
                            تحديد موعد النشر
                          </Link>
                        )}
                        {(row.deleted_at
                          ? ["restore"]
                          : [
                              "duplicate",
                              "review",
                              ...(row.status === "published"
                                ? ["unpublished"]
                                : ["publish"]),
                              "archived",
                              "delete",
                            ]
                        ).map((action) => (
                          <button
                            key={action}
                            disabled={busy || loading || !mayAct(row, action)}
                            onClick={() => void act(action, row)}
                          >
                            {actionLabels[action]}
                          </button>
                        ))}
                        {row.status === "published" && !row.deleted_at && (
                          <Link href={`/posts/${row.slug}`}>قراءة المقال</Link>
                        )}
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="control-card editorial-empty">
          <FileText size={36} aria-hidden="true" />
          <h2>لا توجد مقالات بهذه الفلاتر</h2>
          <p>غيّر البحث أو ابدأ مسودة جديدة.</p>
          {create && (
            <Link className="button" href="/admin/posts/new">
              إضافة مقال جديد
            </Link>
          )}
        </div>
      )}
      <nav className="pagination" aria-label="صفحات المقالات">
        <button
          disabled={busy || loading || query.page <= 1}
          onClick={() => setQuery((old) => ({ ...old, page: old.page - 1 }))}
        >
          السابقة
        </button>
        <span aria-live="polite">
          الصفحة {query.page} من {pages}
        </span>
        <button
          disabled={busy || loading || query.page >= pages}
          onClick={() => setQuery((old) => ({ ...old, page: old.page + 1 }))}
        >
          التالية
        </button>
      </nav>
    </section>
  );
}
