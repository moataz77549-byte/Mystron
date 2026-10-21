"use client";
import { useState } from "react";
import { command } from "./command";
import { adminErrorMessage } from "@/lib/client/request";
type Row = { id: string; [key: string]: unknown };
type Field = {
  key: string;
  label: string;
  kind?: "number" | "boolean" | "textarea" | "json" | "datetime" | "color";
  nullable?: boolean;
  defaultValue?: string;
};
export default function Catalog({
  resource,
  title,
  initial,
  fields,
}: {
  resource: string;
  title: string;
  initial: Row[];
  fields: Field[];
}) {
  const [rows, setRows] = useState(initial);
  const [item, setItem] = useState<Row | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(
      fields.map((f) => [
        f.key,
        f.defaultValue ??
          (f.kind === "boolean"
            ? f.key !== "sponsored"
            : f.kind === "number"
              ? 0
              : f.kind === "json"
                ? f.key === "pages"
                  ? "[]"
                  : "{}"
                : f.key === "style"
                  ? "navy"
                  : f.key === "placement"
                    ? "ticker"
                    : f.kind === "datetime" && !f.nullable
                      ? new Date().toISOString().slice(0, 16)
                      : ""),
      ]),
    ),
  );
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [transfer, setTransfer] = useState("");
  const [busy, setBusy] = useState(false);
  function edit(row: Row | null) {
    setItem(row);
    const next: Record<string, unknown> = {};
    for (const f of fields) {
      const value =
        row?.[f.key] ??
        f.defaultValue ??
        (f.kind === "boolean"
          ? f.key !== "sponsored"
          : f.kind === "number"
            ? 0
            : f.kind === "json"
              ? f.key === "pages"
                ? []
                : {}
              : f.key === "style"
                ? "navy"
                : f.key === "placement"
                  ? "ticker"
                  : f.kind === "datetime" && !f.nullable
                    ? new Date().toISOString()
                    : "");
      next[f.key] =
        f.kind === "json"
          ? JSON.stringify(value, null, 2)
          : f.kind === "datetime" && value
            ? new Date(String(value)).toISOString().slice(0, 16)
            : value;
    }
    setValues(next);
    setError("");
  }
  async function save(action = "save") {
    setBusy(true);
    try {
      const patch: Record<string, unknown> = {};
      for (const f of fields) {
        const v = values[f.key];
        patch[f.key] =
          f.kind === "json"
            ? JSON.parse(String(v || "{}"))
            : f.kind === "number"
              ? Number(v)
              : f.kind === "datetime"
                ? v
                  ? new Date(String(v) + "Z").toISOString()
                  : null
                : f.nullable && !v
                  ? null
                  : v;
      }
      patch.action = action;
      const d = await command(resource, {
        id: item?.id || null,
        patch,
        ...(resource === "categories" ? { transfer_to: transfer || null } : {}),
      });
      setRows((r) =>
        action === "delete" && resource === "ticker"
          ? r.filter((x) => x.id !== item?.id)
          : item
            ? r.map((x) => (x.id === d.id ? d : x))
            : [d, ...r],
      );
      edit(null);
    } catch (e) {
      setError(adminErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>{title}</h1>
      <label>
        البحث في آخر 100 عنصر
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="catalog-grid">
        <section>
          <h2>{item ? "تعديل" : "إضافة"}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {fields.map((f) => (
              <label key={f.key}>
                {f.label}
                {f.kind === "boolean" ? (
                  <input
                    type="checkbox"
                    checked={!!values[f.key]}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.key]: e.target.checked }))
                    }
                  />
                ) : f.kind === "textarea" || f.kind === "json" ? (
                  <textarea
                    rows={f.kind === "json" ? 5 : 3}
                    dir="auto"
                    value={String(values[f.key] ?? "")}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.key]: e.target.value }))
                    }
                  />
                ) : (
                  <input
                    type={
                      f.kind === "number"
                        ? "number"
                        : f.kind === "color"
                          ? "color"
                          : f.kind === "datetime"
                            ? "datetime-local"
                            : "text"
                    }
                    dir="auto"
                    value={String(values[f.key] ?? "")}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.key]: e.target.value }))
                    }
                  />
                )}
              </label>
            ))}
            <button disabled={busy}>حفظ</button>
            {item && (
              <button type="button" onClick={() => edit(null)}>
                إلغاء التعديل
              </button>
            )}
          </form>
          {item && (
            <>
              {resource === "categories" && (
                <label>
                  معرّف القسم البديل للحذف أو النقل
                  <input
                    dir="ltr"
                    value={transfer}
                    onChange={(e) => setTransfer(e.target.value)}
                  />
                </label>
              )}
              {resource === "categories" && (
                <button
                  disabled={busy || !transfer}
                  onClick={async () => {
                    try {
                      const n = await command("category-transfer", {
                        id: item.id,
                        transfer_to: transfer,
                      });
                      setError(`تم نقل ${n} تدوينة إلى القسم المحدد.`);
                    } catch (e) {
                      setError(adminErrorMessage(e));
                    }
                  }}
                >
                  نقل القسم الأساسي مع حفظ التصنيف السابق
                </button>
              )}
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      "حذف هذا العنصر؟ تُرفض العملية إن تعذّرت معالجة العناصر المرتبطة.",
                    )
                  )
                    void save("delete");
                }}
              >
                حذف آمن
              </button>
              {resource !== "ticker" && (
                <button disabled={busy} onClick={() => void save("restore")}>
                  استعادة
                </button>
              )}
            </>
          )}
          {error && <p role="alert">{error}</p>}
        </section>
        <section>
          <h2>العناصر</h2>
          {rows
            .filter((r) => JSON.stringify(r).includes(query))
            .map((r) => (
              <article className="catalog-card" key={r.id}>
                <h3>{String(r.name || r.display_name || r.text)}</h3>
                <p>
                  {String(r.slug || "")} · {r.is_active ? "ظاهر" : "مخفي"}
                  {r.deleted_at ? " · محذوف" : ""}
                </p>
                <code dir="ltr">{r.id}</code>
                <button onClick={() => edit(r)}>تعديل</button>
              </article>
            ))}
          {!rows.length && <p>لا توجد عناصر بعد.</p>}
        </section>
      </div>
    </>
  );
}
