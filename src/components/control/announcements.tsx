"use client";
import { useState } from "react";
import Image from "next/image";
import { ControlForm, Action } from "./form";
type Ad = {
  id: string;
  text: string;
  url: string | null;
  placement: string;
  is_active: boolean;
  sort_order: number;
  starts_at: string;
  ends_at: string | null;
  sponsored: boolean;
  style: string;
  pages: string[];
  image_asset_id: string | null;
};
export function AnnouncementsEditor({
  items,
  assets,
}: {
  items: Ad[];
  assets: { id: string; display_name: string }[];
}) {
  const [id, setId] = useState("");
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [preview, setPreview] = useState<{
    text: string;
    url: string | null;
    image_asset_id: string | null;
    sponsored: boolean;
  } | null>(null);
  const item = items.find((i) => i.id === id);
  return (
    <section className="control-card">
      <h2>تحرير إعلان أو تنبيه</h2>
      <label>
        العنصر
        <select
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setPreview(null);
          }}
        >
          <option value="">عنصر جديد</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.text}
            </option>
          ))}
        </select>
      </label>
      <ControlForm
        key={id}
        initial={{
          text: item?.text || "",
          url: item?.url || "",
          placement: item?.placement || "ticker",
          is_active: item?.is_active ?? true,
          sort_order: item?.sort_order || 0,
          starts_at: item?.starts_at.slice(0, 16) || "",
          ends_at: item?.ends_at?.slice(0, 16) || "",
          sponsored: item?.sponsored ?? false,
          style: item?.style || "navy",
          pages: item?.pages.join("\n") || "",
          image_asset_id: item?.image_asset_id || "",
        }}
        fields={[
          { key: "text", label: "النص", type: "textarea", required: true },
          { key: "url", label: "الرابط الاختياري" },
          {
            key: "placement",
            label: "موضع العرض",
            type: "select",
            options: [
              "ticker",
              "top",
              "home",
              "article",
              "article_after",
              "sidebar",
              "footer",
            ].map((v, i) => ({
              value: v,
              label: [
                "الشريط المتحرك",
                "أعلى الموقع",
                "الرئيسية",
                "داخل المقال قبل المحتوى",
                "أسفل المقال",
                "الشريط الجانبي على الكمبيوتر",
                "التذييل",
              ][i],
            })),
          },
          {
            key: "starts_at",
            label: "بداية العرض UTC",
            type: "datetime-local",
            required: true,
          },
          { key: "ends_at", label: "نهاية العرض UTC", type: "datetime-local" },
          { key: "is_active", label: "مفعّل", type: "checkbox" },
          { key: "sponsored", label: "إعلان مدفوع", type: "checkbox" },
          {
            key: "sort_order",
            label: "الترتيب",
            type: "number",
            min: -10000,
            max: 10000,
          },
          {
            key: "style",
            label: "النمط",
            type: "select",
            options: ["navy", "gold", "teal", "burgundy"].map((v) => ({
              value: v,
              label: v,
            })),
          },
          {
            key: "pages",
            label: "الصفحات المستهدفة (مسار في كل سطر، أو فارغ لكل الصفحات)",
            type: "textarea",
          },
          {
            key: "image_asset_id",
            label: "صورة اختيارية",
            type: "select",
            options: [
              { value: "", label: "دون صورة" },
              ...assets.map((a) => ({ value: a.id, label: a.display_name })),
            ],
          },
        ]}
        label="معاينة العنصر"
        successMessage="راجع المعاينة قبل الاعتماد."
        submit={async (v) => {
          setPreview(v as unknown as typeof preview);
          setDraft(v);
        }}
      />
      {preview && (
        <div className="control-card">
          <strong>{preview.sponsored ? "إعلان مدفوع" : "تنبيه تحريري"}</strong>
          <p>{preview.text}</p>
          {preview.image_asset_id && (
            <Image
              src={"/api/v1/admin/media/" + preview.image_asset_id}
              width={320}
              height={180}
              alt=""
            />
          )}
          <Action
            resource="ticker"
            label="اعتماد الإعلان"
            body={{
              id: id || null,
              patch: {
                ...draft,
                url: preview.url || null,
                image_asset_id: preview.image_asset_id || null,
                starts_at: String(draft.starts_at) + ":00.000Z",
                ends_at: draft.ends_at
                  ? String(draft.ends_at) + ":00.000Z"
                  : null,
                pages: String(draft.pages || "")
                  .split("\n")
                  .filter(Boolean),
              },
            }}
          />
        </div>
      )}
      {item && (
        <Action
          resource="ticker"
          label="حذف العنصر"
          danger
          body={{ id, patch: { action: "delete" } }}
        />
      )}
    </section>
  );
}
