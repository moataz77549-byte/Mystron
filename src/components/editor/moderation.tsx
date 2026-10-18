"use client";
import { useState } from "react";
import { command } from "./command";
type Comment = {
  id: string;
  guest_name: string;
  body: string;
  status: string;
  post_id: string;
  deleted_at: string | null;
};
export default function Moderation({ initial }: { initial: Comment[] }) {
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("pending");
  return (
    <>
      <h1>مراجعة التعليقات</h1>
      <select
        aria-label="حالة التعليق"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      >
        {["pending", "approved", "rejected", "hidden", "all"].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      {error && <p role="alert">{error}</p>}
      {rows
        .filter(
          (r) => !r.deleted_at && (filter === "all" || r.status === filter),
        )
        .map((r) => (
          <article key={r.id} className="catalog-card">
            <h2>
              {r.guest_name} <small>زائر</small>
            </h2>
            <p>{r.body}</p>
            <p>
              التدوينة: {r.post_id} · {r.status}
            </p>
            <div className="editor-toolbar">
              {[
                ["approved", "قبول"],
                ["rejected", "رفض"],
                ["hidden", "إخفاء"],
                ["delete", "حذف"],
              ].map(([action, label]) => (
                <button
                  key={action}
                  onClick={async () => {
                    try {
                      await command("comments", { id: r.id, action });
                      setRows((a) =>
                        a.map((x) =>
                          x.id === r.id
                            ? {
                                ...x,
                                status: action,
                                deleted_at:
                                  action === "delete"
                                    ? new Date().toISOString()
                                    : null,
                              }
                            : x,
                        ),
                      );
                      setError("");
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </article>
        ))}
      {!rows.length && <p>لا توجد تعليقات.</p>}
    </>
  );
}
