"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  settingSchemas,
  settingDefaults,
  type SettingKey,
} from "@/lib/control/settings-schema";
import { command, errorMessage } from "./form";
type Row = { key: string; value: unknown; version: number };
const names: Record<SettingKey, string> = {
  identity: "إعدادات الهوية",
  media: "الوسائط",
  home: "الصفحة الرئيسية",
  publishing: "النشر",
  comments: "التعليقات",
  seo: "SEO",
  security: "الأمان",
  maintenance: "الصيانة",
};
const textNames: Record<string, string> = {
  max_upload_bytes: "أقصى حجم عبر خدمة الرفع بالبايت (256KiB إلى 5MiB)",
  allow_gif: "السماح برفع GIF",
  webp_quality: "جودة مشتقات WebP (40–95)",
  name: "اسم المنصة",
  description: "الوصف",
  footer: "نص التذييل",
  logo_asset_id: "الشعار",
  favicon_asset_id: "أيقونة الموقع",
  og_asset_id: "صورة المشاركة الافتراضية",
  font: "الخط",
  default_theme: "الوضع الافتراضي",
  title_suffix: "لاحقة العنوان",
  enabled: "مفعّل",
  message: "رسالة الصيانة",
  until: "الانتهاء الاختياري UTC",
  default_comments: "تفعيل التعليقات افتراضياً",
  comments_close_days: "إغلاق التعليقات بعد أيام (0 دون حد)",
  timezone: "المنطقة الزمنية",
  default_visibility: "الظهور الافتراضي",
  view_retention_days: "احتفاظ المشاهدات الخام بالأيام",
  pre_moderation: "المراجعة المسبقة",
  replies: "السماح بالردود",
  max_depth: "أقصى عمق للردود",
  limit: "حد التعليقات خلال الفترة",
  window_seconds: "فترة الحد بالثواني",
  blocked_words: "كلمات محظورة (كل كلمة في سطر)",
  blocked_emails: "عناوين بريد محظورة (كل عنوان في سطر)",
  session_max_age_minutes: "أقصى عمر للجلسة الإدارية بالدقائق",
  event_retention_days: "احتفاظ أحداث الأمان بالأيام",
  audit_retention_days: "احتفاظ سجل التدقيق بالأيام",
};
export function SettingsEditor({
  rows,
  tab,
  permissions,
  group = "appearance",
  assets,
  categories,
  posts,
}: {
  rows: Row[];
  tab: SettingKey;
  permissions: string[];
  group?: "general" | "appearance";
  assets: { id: string; display_name: string }[];
  categories: { id: string; name: string }[];
  posts: { id: string; title: string }[];
}) {
  const row = rows.find((r) => r.key === tab);
  const [value, setValue] = useState<Record<string, unknown>>(() =>
    structuredClone(
      (row?.value || settingDefaults[tab]) as Record<string, unknown>,
    ),
  );
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const allowed = permissions.includes(
    tab === "security"
      ? "security.manage"
      : tab === "maintenance"
        ? "maintenance.manage"
        : "settings.update",
  );
  function change(key: string, v: unknown) {
    setValue((s) => ({ ...s, [key]: v }));
    setPreview(false);
  }
  const general = ["name", "description", "footer", "socials"];
  const keyNames = Object.keys(settingDefaults[tab]).filter(
    (k) =>
      tab !== "identity" ||
      (group === "general" ? general.includes(k) : !general.includes(k)),
  );
  return (
    <section className="control-card">
      <h2>{names[tab]}</h2>
      <p>
        تُطبق التغييرات بعد المعاينة والاعتماد. إعدادات الحظر والأمان لا تظهر
        عبر API العام.
      </p>
      {tab === "home" ? (
        <HomeSections
          value={value}
          change={(v) => {
            setValue(v);
            setPreview(false);
          }}
          categories={categories}
          posts={posts}
        />
      ) : (
        <div className="form control-form">
          {keyNames.map((k) => {
            const v = value[k];
            if (k === "socials")
              return (
                <label key={k}>
                  روابط التواصل (الاسم | رابط HTTPS، كل رابط في سطر)
                  <textarea
                    aria-label={textNames[k] || k}
                    rows={4}
                    value={((v as { label: string; url: string }[]) || [])
                      .map((s) => s.label + " | " + s.url)
                      .join("\n")}
                    onChange={(e) =>
                      change(
                        k,
                        e.target.value
                          .split("\n")
                          .filter(Boolean)
                          .map((line) => {
                            const [label, ...url] = line.split("|");
                            return {
                              label: label.trim(),
                              url: url.join("|").trim(),
                            };
                          }),
                      )
                    }
                  />
                </label>
              );
            if (k === "palette" || k === "dark_palette")
              return (
                <fieldset key={k}>
                  <legend>
                    {k === "palette" ? "ألوان الهوية" : "ألوان الوضع الداكن"}
                  </legend>
                  {Object.entries((v as Record<string, string>) || {}).map(
                    ([color, c]) => (
                      <label key={color}>
                        {
                          (
                            {
                              navy: "الكحلي",
                              gold: "الذهبي",
                              ivory: "العاجي",
                              teal: "الفيروزي",
                              burgundy: "الخمري",
                              background: "الخلفية",
                              foreground: "النص",
                              surface: "البطاقات",
                              muted: "النص الثانوي",
                              border: "الحدود",
                            } as Record<string, string>
                          )[color]
                        }
                        <input
                          type="color"
                          value={c}
                          onChange={(e) =>
                            change(k, {
                              ...(v as Record<string, string>),
                              [color]: e.target.value,
                            })
                          }
                        />
                      </label>
                    ),
                  )}
                </fieldset>
              );
            if (k.endsWith("_asset_id"))
              return (
                <label key={k}>
                  {textNames[k]}
                  <select
                    value={String(v || "")}
                    onChange={(e) => change(k, e.target.value || null)}
                  >
                    <option value="">دون صورة</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.display_name}
                      </option>
                    ))}
                  </select>
                </label>
              );
            if (
              [
                "font",
                "default_theme",
                "timezone",
                "default_visibility",
              ].includes(k)
            ) {
              const options =
                k === "font"
                  ? ["IBM Plex Sans Arabic", "Noto Naskh Arabic"]
                  : k === "default_theme"
                    ? ["system", "light", "dark"]
                    : k === "timezone"
                      ? ["Asia/Aden"]
                      : ["public", "private"];
              return (
                <label key={k}>
                  {textNames[k]}
                  <select
                    value={String(v)}
                    onChange={(e) => change(k, e.target.value)}
                  >
                    {options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }
            if (Array.isArray(v))
              return (
                <label key={k}>
                  {textNames[k]}
                  <textarea
                    aria-label={textNames[k] || k}
                    rows={5}
                    value={v.join("\n")}
                    onChange={(e) =>
                      change(k, e.target.value.split("\n").filter(Boolean))
                    }
                  />
                </label>
              );
            if (typeof v === "boolean")
              return (
                <label key={k}>
                  <input
                    type="checkbox"
                    checked={v}
                    onChange={(e) => change(k, e.target.checked)}
                  />
                  {textNames[k]}
                </label>
              );
            if (k === "until")
              return (
                <label key={k}>
                  {textNames[k]}
                  <input
                    type="datetime-local"
                    value={typeof v === "string" ? v.slice(0, 16) : ""}
                    onChange={(e) =>
                      change(
                        k,
                        e.target.value ? e.target.value + ":00.000Z" : null,
                      )
                    }
                  />
                </label>
              );
            return (
              <label key={k}>
                {textNames[k] || k}
                {typeof v === "number" ? (
                  <input
                    type="number"
                    value={v}
                    disabled={k === "view_retention_days"}
                    onChange={(e) => change(k, Number(e.target.value))}
                  />
                ) : (
                  <textarea
                    aria-label={textNames[k] || k}
                    rows={k === "description" || k === "message" ? 3 : 2}
                    maxLength={500}
                    value={String(v || "")}
                    onChange={(e) => change(k, e.target.value)}
                  />
                )}
              </label>
            );
          })}
        </div>
      )}
      {allowed && (
        <div className="toolbar">
          <button
            className="button outline"
            onClick={() => {
              const result = settingSchemas[tab].safeParse(value);
              if (!result.success) {
                setMessage(
                  "تحتاج بعض القيم إلى تصحيح: " +
                    result.error.issues.map((i) => i.path.join(".")).join("، "),
                );
                return;
              }
              setMessage("راجع المعاينة ثم اعتمد التغييرات.");
              setPreview(true);
            }}
          >
            معاينة التغييرات
          </button>
          <button
            className="button outline"
            onClick={() => {
              if (
                confirm(
                  "استعادة القيم الافتراضية غير الحساسة في النموذج؟ لن تُحفظ قبل الاعتماد.",
                )
              ) {
                setValue(
                  structuredClone(settingDefaults[tab]) as unknown as Record<
                    string,
                    unknown
                  >,
                );
                setPreview(false);
              }
            }}
          >
            استعادة الافتراضي في النموذج
          </button>
        </div>
      )}
      {preview && (
        <section className="control-card">
          <h3>معاينة قبل الاعتماد</h3>
          {tab === "identity" ? (
            <div
              className="identity-preview"
              style={{
                background: (value.palette as Record<string, string>).ivory,
                color: (value.palette as Record<string, string>).navy,
                fontFamily: String(value.font),
              }}
            >
              <h2>{String(value.name)}</h2>
              <p>{String(value.description)}</p>
              <span
                style={{
                  background: (value.palette as Record<string, string>).teal,
                  color: "#fff",
                  padding: 12,
                }}
              >
                مثال بطاقة
              </span>
              <p>{String(value.footer)}</p>
            </div>
          ) : tab === "home" ? (
            <ol>
              {(value.sections as { title: string; enabled: boolean }[])
                .filter((s) => s.enabled)
                .map((s, i) => (
                  <li key={i}>{s.title}</li>
                ))}
            </ol>
          ) : (
            <dl>
              {Object.entries(value).map(([k, v]) => (
                <div key={k}>
                  <dt>{textNames[k] || k}</dt>
                  <dd>
                    {Array.isArray(v)
                      ? v.join("، ")
                      : typeof v === "boolean"
                        ? v
                          ? "نعم"
                          : "لا"
                        : String(v ?? "دون حد")}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              if (
                tab === "maintenance" &&
                value.enabled &&
                !confirm(
                  "تفعيل الصيانة للصفحات العامة؟ تبقى الإدارة والمصادقة وفحص الصحة متاحة.",
                )
              )
                return;
              setBusy(true);
              try {
                await command("settings", {
                  key: tab,
                  value: settingSchemas[tab].parse(value),
                  version: Number(row?.version || 1),
                });
                setMessage("حُفظت الإعدادات واعتُمدت.");
                setPreview(false);
                router.refresh();
              } catch (e) {
                setMessage(errorMessage(e instanceof Error ? e.message : ""));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "جارٍ الاعتماد…" : "اعتماد التغييرات"}
          </button>
        </section>
      )}
      <p role="status">{message}</p>
      {!allowed && <p>لديك صلاحية الاطلاع فقط.</p>}
    </section>
  );
}
function HomeSections({
  value,
  change,
  categories,
  posts,
}: {
  value: Record<string, unknown>;
  change: (v: Record<string, unknown>) => void;
  categories: { id: string; name: string }[];
  posts: { id: string; title: string }[];
}) {
  type Section = {
    id: string;
    type: string;
    title: string;
    description?: string;
    enabled: boolean;
    hide_empty: boolean;
    limit: number;
    category_id?: string | null;
    post_ids?: string[];
  };
  const sections = value.sections as Section[];
  function update(i: number, patch: Partial<Section>) {
    change({
      sections: sections.map((s, n) => (n === i ? { ...s, ...patch } : s)),
    });
  }
  function move(i: number, step: number) {
    const next = [...sections];
    [next[i], next[i + step]] = [next[i + step], next[i]];
    change({ sections: next });
  }
  return (
    <>
      <p>
        رتّب الأقسام بأزرار النقل المتاحة بلوحة المفاتيح. المقال اليدوي يحتاج
        تدوينة منشورة.
      </p>
      {sections.map((s, i) => (
        <section key={s.id} className="home-section-editor">
          <div className="toolbar">
            <button
              className="button outline"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label={"نقل " + s.title + " للأعلى"}
            >
              ↑
            </button>
            <button
              className="button outline"
              disabled={i === sections.length - 1}
              onClick={() => move(i, 1)}
              aria-label={"نقل " + s.title + " للأسفل"}
            >
              ↓
            </button>
            <button
              className="button outline"
              onClick={() =>
                change({ sections: sections.filter((_, n) => i !== n) })
              }
            >
              إزالة من الصفحة الرئيسية
            </button>
          </div>
          <div className="form">
            <label>
              العنوان
              <input
                value={s.title}
                maxLength={100}
                onChange={(e) => update(i, { title: e.target.value })}
              />
            </label>
            <label>
              نوع القسم
              <select
                value={s.type}
                onChange={(e) => update(i, { type: e.target.value })}
              >
                {[
                  "hero",
                  "featured",
                  "latest",
                  "popular",
                  "category",
                  "manual",
                ].map((v, n) => (
                  <option key={v} value={v}>
                    {
                      [
                        "المقدمة",
                        "المقال المميز",
                        "الأحدث",
                        "الأكثر قراءة",
                        "قسم معين",
                        "اختيار يدوي",
                      ][n]
                    }
                  </option>
                ))}
              </select>
            </label>
            {s.type === "hero" && (
              <label>
                نص المقدمة
                <textarea
                  aria-label="نص المقدمة"
                  value={s.description || ""}
                  onChange={(e) => update(i, { description: e.target.value })}
                />
              </label>
            )}
            <label>
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={(e) => update(i, { enabled: e.target.checked })}
              />
              ظاهر
            </label>
            <label>
              <input
                type="checkbox"
                checked={s.hide_empty}
                onChange={(e) => update(i, { hide_empty: e.target.checked })}
              />
              إخفاء عند خلوّه
            </label>
            <label>
              عدد التدوينات
              <input
                type="number"
                min={1}
                max={24}
                value={s.limit}
                onChange={(e) => update(i, { limit: Number(e.target.value) })}
              />
            </label>
            {s.type === "category" && (
              <label>
                القسم
                <select
                  value={s.category_id || ""}
                  onChange={(e) =>
                    update(i, { category_id: e.target.value || null })
                  }
                >
                  <option value="">اختر القسم</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {["manual", "featured"].includes(s.type) && (
              <fieldset>
                <legend>اختيار تدوينات منشورة (اختياري للمميز)</legend>
                {posts.map((p) => (
                  <label key={p.id}>
                    <input
                      type="checkbox"
                      checked={s.post_ids?.includes(p.id) || false}
                      onChange={(e) =>
                        update(i, {
                          post_ids: e.target.checked
                            ? [...(s.post_ids || []), p.id]
                            : (s.post_ids || []).filter((id) => id !== p.id),
                        })
                      }
                    />
                    {p.title}
                  </label>
                ))}
                {!posts.length && <p>لا توجد تدوينات منشورة.</p>}
              </fieldset>
            )}
          </div>
        </section>
      ))}
      <button
        className="button outline"
        disabled={sections.length >= 20}
        onClick={() =>
          change({
            sections: [
              ...sections,
              {
                id: crypto.randomUUID(),
                type: "latest",
                title: "قسم جديد",
                enabled: true,
                hide_empty: true,
                limit: 6,
              },
            ],
          })
        }
      >
        إضافة قسم عرض
      </button>
    </>
  );
}
