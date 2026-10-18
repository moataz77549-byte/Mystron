"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { command } from "./command";
type Row = {
  id: string;
  title: string;
  slug: string;
  status: string;
  version: number;
  deleted_at: string | null;
  updated_at: string;
  can_update?: boolean;
  can_delete?: boolean;
  can_publish?: boolean;
  can_duplicate?: boolean;
};
export default function PostList({
  initial,
  publisher,
  create = true,
}: {
  initial: Row[];
  publisher: boolean;
  create?: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(initial.length === 100);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void fetch(
        "/api/v1/admin/data?" +
          new URLSearchParams({
            resource: "posts",
            q,
            status: filter,
            page: "1",
          }),
      )
        .then(async (r) => {
          const j = await r.json();
          if (!active) return;
          if (!r.ok) throw new Error(j.error?.code);
          setRows(j.data);
          setPage(1);
          setMore(j.total > j.data.length);
          setSelected([]);
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, filter]);
  async function loadMore() {
    try {
      const r = await fetch(
        "/api/v1/admin/data?" +
          new URLSearchParams({
            resource: "posts",
            q,
            status: filter,
            page: String(page + 1),
          }),
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.code);
      setRows((old) => [
        ...old,
        ...j.data.filter((x: Row) => !old.some((o) => o.id === x.id)),
      ]);
      setPage((p) => p + 1);
      setMore(j.total > (page + 1) * 100);
    } catch (e) {
      setError(String(e));
    }
  }
  async function act(action: string, row?: Row) {
    try {
      if (row) {
        const p = await command("transitions", {
          id: row.id,
          version: row.version,
          action,
        });
        if (action === "duplicate") setRows((r) => [p, ...r]);
        else setRows((r) => r.map((x) => (x.id === p.id ? p : x)));
      } else {
        const changed = await command("bulk", {
          items: rows
            .filter((r) => selected.includes(r.id))
            .map((r) => ({ id: r.id, version: r.version })),
          action,
        });
        setRows((r) =>
          r.map((x) => ({
            ...x,
            ...changed.find((c: Row) => c.id === x.id),
            ...(selected.includes(x.id) && action === "delete"
              ? { deleted_at: new Date().toISOString() }
              : {}),
          })),
        );
        setSelected([]);
      }
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <>
      <h1>التدوينات</h1>
      {create && (
        <Link className="button" href="/admin/posts/new">
          تدوينة جديدة
        </Link>
      )}
      <label>
        البحث في التدوينات
        <input value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <select
        aria-label="حالة التدوينة"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      >
        <option value="">كل الحالات</option>
        {[
          "draft",
          "review",
          "scheduled",
          "published",
          "unpublished",
          "archived",
          "trash",
        ].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      {selected.length > 0 && (
        <div className="editor-toolbar">
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
          ).map((a) => (
            <button
              key={a}
              disabled={rows
                .filter((r) => selected.includes(r.id))
                .some((r) =>
                  ["publish", "unpublished", "archived"].includes(a)
                    ? !r.can_publish
                    : ["delete", "restore"].includes(a)
                      ? !r.can_delete
                      : !r.can_update,
                )}
              onClick={() => void act(a)}
            >
              {a} ({selected.length})
            </button>
          ))}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>اختيار</th>
              <th>العنوان</th>
              <th>الحالة</th>
              <th>العمليات</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter(
                (r) =>
                  r.title.includes(q) &&
                  (!filter ||
                    (filter === "trash"
                      ? r.deleted_at
                      : r.status === filter && !r.deleted_at)),
              )
              .map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      aria-label={`اختيار ${r.title}`}
                      type="checkbox"
                      checked={selected.includes(r.id)}
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked
                            ? [...s, r.id]
                            : s.filter((id) => id !== r.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <Link href={`/admin/posts/${r.id}/edit`}>{r.title}</Link>
                  </td>
                  <td>{r.deleted_at ? "محذوفة" : r.status}</td>
                  <td>
                    {r.deleted_at ? (
                      <button
                        disabled={!r.can_delete}
                        onClick={() => void act("restore", r)}
                      >
                        استعادة
                      </button>
                    ) : (
                      <>
                        <button
                          disabled={!r.can_duplicate}
                          onClick={() => void act("duplicate", r)}
                        >
                          نسخ
                        </button>
                        <button
                          disabled={!r.can_delete}
                          onClick={() => void act("delete", r)}
                        >
                          حذف آمن
                        </button>
                        {r.status === "published" && (
                          <Link href={`/posts/${r.slug}`}>قراءة</Link>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {more && <button onClick={() => void loadMore()}>تحميل المزيد</button>}
      {!rows.length && <p>لا توجد تدوينات بعد.</p>}
    </>
  );
}
