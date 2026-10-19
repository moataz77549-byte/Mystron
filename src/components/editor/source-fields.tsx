"use client";
import type { EditorialSource } from "@/lib/editor/sources";
export function SourceFields({
  value,
  onChange,
}: {
  value: EditorialSource[];
  onChange: (value: EditorialSource[]) => void;
}) {
  return (
    <fieldset className="editor-sources">
      <legend>المصادر والمراجع</legend>
      {value.map((source, index) => (
        <fieldset key={index}>
          <legend>المصدر {index + 1}</legend>
          {(
            [
              ["title", "اسم المصدر"],
              ["author", "المؤلف"],
              ["url", "رابط المصدر"],
              ["page", "رقم الصفحة"],
              ["published_at", "تاريخ نشر المصدر"],
              ["notes", "ملاحظات المصدر"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type={
                  key === "published_at"
                    ? "date"
                    : key === "url"
                      ? "url"
                      : "text"
                }
                dir={key === "url" ? "ltr" : "auto"}
                value={source[key] || ""}
                maxLength={
                  key === "notes" || key === "url"
                    ? 2000
                    : key === "page"
                      ? 100
                      : 300
                }
                onChange={(event) =>
                  onChange(
                    value.map((row, at) =>
                      at === index
                        ? { ...row, [key]: event.target.value }
                        : row,
                    ),
                  )
                }
              />
            </label>
          ))}
          <button
            type="button"
            onClick={() => onChange(value.filter((_, at) => at !== index))}
          >
            إزالة المصدر {index + 1}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={value.length >= 50}
        onClick={() => onChange([...value, { title: "", url: "" }])}
      >
        إضافة مصدر
      </button>
    </fieldset>
  );
}
